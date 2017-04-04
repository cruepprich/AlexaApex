/* When the app won't run and you get an Error: listen EADDRINUSE
   then Apache is probably running.
   Check: sudo /etc/init.d/apache2 status
   Stop: sudo /etc/init.d/apache2 stop
*/
var path           = require('path');
var fs             = require('fs');
var express        = require('express');
var http           = require('http');
var https          = require('https');
var forceSSL       = require('express-force-ssl');
var app            = express();
var proxy          = require('http-proxy-middleware');
var config         = require('./config');
var exec           = require('child_process').exec;
var RESTClient     = require('node-rest-client').Client;
var bodyParser     = require("body-parser");
var alexa          = require('alexa-app');

var privateKey, certificate, respMessage;
var RESTPATH       = '/rest';

var restClient = new RESTClient();

//allow self signed certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Default Ports
var PORTS = {
  HTTP: config.web.http.port || 80,
  HTTPS: config.web.https.port || 443,
  FORCE_SSL_PORT: ''
}

console.log('config.web.https.forceSSLPort',config.web.https.forceSSLPort);
console.log('PORTS.HTTPS',PORTS.HTTPS);
console.log('Forcing SSL port',PORTS.FORCE_SSL_PORT);

// #2 SSL Support. All triggerd by the presence of config.web.https
if (config.web.https.enabled){
  console.log('Enabling HTTPS');
  privateKey = fs.readFileSync(path.resolve(config.web.https.keyPath));
  certificate = fs.readFileSync(path.resolve(config.web.https.certPath));

  if (config.web.https.forceHttps) {
    app.set('forceSSLOptions', {
      enable301Redirects: true,
      trustXFPHeader: false,
      httpsPort: PORTS.FORCE_SSL_PORT,
      sslRequiredMessage: 'SSL Required.'
    });
    app.use(forceSSL);
  }// config.web.https.forceHttps

}// config.web.https

//Uncomment if you don't want to redirect / and /apex to the new /ords
if (config.ords.redirectPaths.length > 0){
  for(i=0; i< config.ords.redirectPaths.length; i++){
    app.use(config.ords.redirectPaths[i],function(req, res, next){
      res.redirect(config.ords.path);
    });
  }
}

//Can store custom images in public/...
app.use(config.static.path, express.static(config.static.directory));
app.use(config.apex.images.path,express.static(config.apex.images.directory));
console.log('config.static.directory',config.static.directory);
console.log('config.apex.images.directory',config.apex.images.directory);


// https://github.com/chimurai/http-proxy-middleware
app.use(config.ords.path,proxy(
  {
    target: config.ords.webContainerUrl,
    changeOrigin: false,
    // Additional work seems to be required for unsigned certificats
    onProxyReq: function(proxyReq, req, res) {
      // For encrypted calls, if we don't set the origin on POST request then we'll get the following error
      // The request cannot be processed because this resource does not support Cross Origin Sharing requests, or the request Origin is not authorized to access this resource. If ords is being reverse proxied ensure the front end server is propagating the host name, for mod_proxy ensure ProxyPreserveHost is set to On
      if (req.connection.encrypted && req.headers.origin){
        proxyReq.setHeader('origin', req.headers.origin.replace(/^https:/,'http:'));
      }
    }, //onProxyReq
    onProxyRes: function(proxyRes, req, res){
      // If encrypted and headers['location'] exists (doesn't happen on some redirects)
      if (req.connection.encrypted && proxyRes.headers['location']){
        proxyRes.headers['location'] = proxyRes.headers['location'].replace(/^http:/g,'https:');
      }
    } // onProxyRes
  }
));

app.get('/uptime', function(req, res, next){
  exec("uptime", function(err,out,stderr) {
  if (!err) {
    res.send(out);
  } else {
    console.log(err,stderr);
    res.send(err,stderr);
  }
  })
});


app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

//Start server
var server = http.createServer(app).listen(PORTS.HTTP,function(){
  console.log('Server Ready');
  console.log('http://ruepprich.com/ords/f?p=102');
  console.log('socket.io will not work with https');
  console.log('On error check that Apache is not already running.');
  console.log('APEX runs on Jackie. Workspace hr,cruepprich, G_22, app 102');
  console.log('Test the skill with:');
  console.log('Alexa, ask apex to get employee onehundred');
});

var io = require('socket.io')(http).listen(server);

//now that we have io, we can attach a route that uses socket
//see http://bit.ly/2f83ql9
app.set('socketIo',io);

app.route(RESTPATH+'/alexaTest').post( function(req, res) {

  var soc = req.app.get('socketIo');
  console.log('Type',req.body.request.type,req.body.request.intent.name);

  if (req.body.request.type === 'LaunchRequest') { /* ... */ }
  else if (req.body.request.type === 'SessionEndedRequest') { /* ... */ }
  else if (req.body.request.type === 'IntentRequest' &&
           req.body.request.intent.name === 'NumberOfOrdersForCustomer') {

                if (!req.body.request.intent.slots.firstName ||
                    !req.body.request.intent.slots.firstName.value) {
                  // Handle this error by producing a response like:
                  // "Hmm, what firstName do you want to know the forecast for?"
                }
                var firstName = req.body.request.intent.slots.firstName.value;
                var lastName = req.body.request.intent.slots.lastName.value;
                var slots = Object.keys(req.body.request.intent.slots).length;

                soc.emit('pong',firstName+" "+lastName);

                console.log('firstName',firstName);
                console.log('lastName',lastName);
                console.log('slots',slots);
                respMessage = 'Hello '+firstName+" "+lastName;
                // Do your business logic to get weather data here!
                // Then send a JSON response...

                res.json({
                  "version": "1.0",
                  "response": {
                    "shouldEndSession": true,
                    "outputSpeech": {
                      "type": "SSML",
                      "ssml": "<speak>"+respMessage+"</speak>"
                    }
                  }
                });

                res.end('done');
              }
  else if (req.body.request.type === 'IntentRequest' &&
           req.body.request.intent.name === 'GetEmployeeID') {
                  if (!req.body.request.intent.slots.empid ||
                    !req.body.request.intent.slots.empid.value) {
                    // Handle this error by producing a response like:
                    // "Hmm, what firstName do you want to know the forecast for?"
                  }
                  var empid = req.body.request.intent.slots.empid.value;
                  var cardMsg,speechMsg;
                  console.log('req empid value ['+empid+']');
                  var restURL = "https://ruepprich.com/ords/hr/alexa/employees/"+empid;
                  console.log('restURL',restURL);
                  //Fetch result via REST
                  restClient.get(restURL, function (data, response) {
                      
                      // parse response body as js object
                      if (typeof data.items[0] != 'undefined') {
                        var emp = data.items[0];
                        var name = emp.first_name+' '+emp.last_name;
                        cardMsg = 'Name: '+name;
                        speechMsg = 'The name of employee '+empid+' is '+name;
                        console.log('cardMsg',cardMsg);
                      } else {
                        cardMsg = 'There is no employee with that ID. ['+empid+']';
                        speechMsg = cardMsg;
                      }

                      soc.emit('card',cardMsg);
                      soc.emit('empid',empid);

                      res.json({
                                "version": "1.0",
                                "response": {
                                  "outputSpeech": {
                                      "type":"SSML"
                                      ,"ssml": "<speak>"+speechMsg+"</speak>",
                                  },
                                  "card": {
                                    "type": "Simple",
                                    "title": "APEX Employee "+empid,
                                    "content": "Query result:\n"+cardMsg
                                  }
                                }
                      });
                      res.end('done');

                  });


            }
else if (req.body.request.type === 'IntentRequest' &&
           req.body.request.intent.name === 'GetEmployeesInDept') {
                  if (!req.body.request.intent.slots.empid ||
                    !req.body.request.intent.slots.empid.value) {
                    // Handle this error by producing a response like:
                    // "Hmm, what firstName do you want to know the forecast for?"
                  }
                  var department_id = req.body.request.intent.slots.department_id.value;
                  var cardMsg,speechMsg;
                  console.log('req department_id value ['+department_id+']');
                  var restURL = "https://ruepprich.com/ords/hr/alexa/department_emps/"+department_id;
                  console.log('restURL',restURL);
                  //Fetch result via REST
                  restClient.get(restURL, function (data, response) {
                  speechMsg = 'Getting employees for department '+department_id;

                      // parse response body as js object
                      if (typeof data.items[0] != 'undefined') {
                        var totalemps = data.items.length;
                        cardMsg = 'Department '+department_id+' has '+totalemps+' Employees';
                        speechMsg = cardMsg;
                        console.log('cardMsg',cardMsg);
                      } else {
                        cardMsg = 'There is no department with that ID. ['+empid+']';
                        speechMsg = cardMsg;
                      }

                      soc.emit('department_id',department_id);

                      res.json({
                                "version": "1.0",
                                "response": {
                                  "outputSpeech": {
                                      "type":"SSML"
                                      ,"ssml": "<speak>"+speechMsg+"</speak>",
                                  },
                                  "card": {
                                    "type": "Simple",
                                    "title": "APEX Employees In Department "+department_id,
                                    "content": "Query result:\n"+cardMsg
                                  }
                                }
                      });
                      res.end('done');

                  });


            }
});


if (config.web.https.enabled){
  https.createServer(
    {
      key: privateKey,
      cert: certificate
    },
    app).listen(PORTS.HTTPS);
}// config.web.https
