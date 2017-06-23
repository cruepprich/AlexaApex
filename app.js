//test
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
//var alexa          = require('alexa-app');

var privateKey, certificate, respMessage;
var RESTPATH       = '/rest';
var NOINTENT       = 'This is not a question I can answer. You can always as apex for help';
var intentType, intentName;

var restClient = new RESTClient();

// Default Ports
var PORTS = {
  HTTP: config.web.http.port || 8080,
  HTTPS: config.web.https.port || 443,
  FORCE_SSL_PORT: ''
}

console.log('config.web.https.forceSSLPort',config.web.https.forceSSLPort);
console.log('PORTS.HTTPS',PORTS.HTTPS);
console.log('Forcing SSL port',PORTS.FORCE_SSL_PORT);

//allow self signed certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

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
app.use(config.apex.custom.path,express.static(config.apex.custom.directory));
console.log('config.static.directory',config.static.directory);
console.log('config.apex.images.directory',config.apex.images.directory);
console.log('config.apex.custom.directory',config.apex.custom.directory);


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
  console.log('http://localhost:8080/ords/f?p=103');
  console.log('socket.io will not work with https');
  console.log('On error check that Apache is not already running.');
  console.log('APEX runs on Jackie. Workspace hr,cruepprich, G_22, app 102/103');
  console.log('Test the skill with:');
  console.log('Navigate to Reports -> Sales by State');
  console.log('"Alexa, ask sales to show me customer orders."');
});

var io = require('socket.io')(http).listen(server);

//now that we have io, we can attach a route that uses socket
//see http://bit.ly/2f83ql9
app.set('socketIo',io);

app.route(RESTPATH+'/alexaTest').post( function(req, res) {

  var soc = req.app.get('socketIo');

//  console.log('Type',req.body.request.type,req.body.request.intent.name);
  intentType = req.body.request.type,req.body;
  console.log('IntentType: ',intentType);

  if (intentType == 'IntentRequest') {

    intentName = req.body.request.intent.name;
    console.log('IntentName: ',intentName);

  } else if (intentType == "SessionEndedRequest") {
    console.log(req.body.request);
    console.log('SESSION ENDING');
  
  } else if (intentType == "LaunchRequest") {
    console.log(req.body.request);
  }


  //=======================================
  //            HelpIntent
  //=======================================
  if (req.body.request.type === 'IntentRequest'
	&&
      req.body.request.intent.name === 'AMAZON.HelpIntent') { 
    console.log('got help intent');
    respMessage = 'You can ask apex to show you the sales for jackets, or customer orders.'
                res.json({
                  "version": "1.0",
                  "response": {
                    "shouldEndSession": false,
                    "outputSpeech": {
                      "type": "SSML",
                      "ssml": "<speak>"+respMessage+"</speak>"
                    }
                  }
                });

                res.end('done');
  }

  //=======================================
  //            LaunchRequest
  //=======================================
  if (req.body.request.type === 'LaunchRequest') {
    console.log('LaunchRequest');
    var speechMsg = 'Welcome to the Alexa Apex demo.';    
    res.json({
              "version": "1.0",
              "response": {
                  "shouldEndSession": false,
                  "outputSpeech": {
                      "type":"SSML"
                      ,"ssml": "<speak>"+speechMsg+"</speak>",
                  }
              },
              "attributes": {
                "string": {}
              },
    });
    res.end('done');    
  }









  //=======================================
  //            SessionEndedRequest
  //=======================================
  else if (req.body.request.type === 'SessionEndedRequest') {
    console.log('SessionEndedRequest');
    var speechMsg = 'Good bye.';
    res.json({
              "version": "1.0",
              "response": {
                  "shouldEndSession": true,
                  "outputSpeech": {
                      "type":"SSML"
                      ,"ssml": "<speak>"+speechMsg+"</speak>",
                  }
              },
              "attributes": {
                "string": {}
              },
    });
    res.end('done');
  }









  //=======================================
  //            Session End
  //=======================================
  else if (req.body.request.type === 'IntentRequest' &&
           req.body.request.intent.name === 'AMAZON.StopIntent') {
    console.log('Session Ended');
    var speechMsg = 'Good bye.';
    res.json({
              "version": "1.0",
              "response": {
                  "shouldEndSession": true,
                  "outputSpeech": {
                      "type":"SSML"
                      ,"ssml": "<speak>"+speechMsg+"</speak>",
                  }
              },
              "attributes": {
                "string": {}
              },
    });
    res.end('done');
  }

  //=======================================
  //            Session Cancelled
  //=======================================
  else if (req.body.request.type === 'IntentRequest' &&
           req.body.request.intent.name === 'AMAZON.CancelIntent') {
    console.log('Session Cancelled');
    var speechMsg = 'Good bye.';
    res.json({
              "version": "1.0",
              "response": {
                  "shouldEndSession": true,
                  "outputSpeech": {
                      "type":"SSML"
                      ,"ssml": "<speak>"+speechMsg+"</speak>",
                  }
              },
              "attributes": {
                "string": {}
              },
    });
    res.end('done');
  }









  //=======================================
  //            CustomerOrders
  //=======================================
  else if (req.body.request.type === 'IntentRequest' &&
           req.body.request.intent.name === 'CustomerOrders') {
  
    console.log('IntentName',req.body.request.intent.name);
    var speechMsg = 'Here are the types of items ordered by our customers.<break time="1s"/>';

    var socketPayload = [];


    soc.emit('CustomerOrders',socketPayload);

   // //Fetch result via REST
    //var restURL = "http://localhost:8080/ords/cmr/alexa/custorders/"
    var restURL = "http://localhost:8080/ords/cmr/alexa/custorders/"

    restClient.get(restURL, function (data, response) {

        if (typeof data.items[0] != 'undefined') {

          var customer_id   = data.items[0].customer_id;
          var customer_name = data.items[0].customer_name;
          var dollars       = data.items[0].dollars;

          cardMsg = customer_name + ": $" + dollars;

          speechMsg += customer_name + " ordered the most for " + dollars + " dollars."

          console.log('cardMsg',cardMsg);

        } else {

          cardMsg = 'There are no orders in the system';
          speechMsg = cardMsg;

        }

        res.json({
                  "version": "1.0",
                  "response": {
                  "shouldEndSession": false,
                    "outputSpeech": {
                        "type":"SSML"
                        ,"ssml": "<speak>"+speechMsg+"</speak>",
                    },
                    "card": {
                      "type": "Simple",
                      "title": "Number of Orders",
                      "content": cardMsg
                    }
                  }
        });
        res.end('done');
    }); 

    // var shouldEndSession = false;
    // var reprompt = "Please repeat that.";

    // res.json({
    //           "version": "1.0",
    //           "response": {
    //               "shouldEndSession": shouldEndSession,
    //               "outputSpeech": {
    //                   "type":"SSML"
    //                   ,"ssml": "<speak>"+speechMsg+"</speak>",
    //               },
    //             "reprompt": {
    //               "outputSpeech": {
    //                 "type": "SSML",
    //                 "ssml":  "<speak>"+reprompt+"</speak>"
    //               }
    //             }
    //           },
    //           "attributes": {
    //             "string": {}
    //           },
    // });
    // res.end('done');
  }




  //=======================================
  //            SalesByMonth
  //=======================================
  else if (req.body.request.type === 'IntentRequest' &&
           req.body.request.intent.name === 'SalesByMonth') {
  
    console.log('IntentName',req.body.request.intent.name);
    var month;
    var speechMsg;

    if (typeof req.body.request.intent.slots.month.value !== 'undefined') {
      month = req.body.request.intent.slots.month.value;
      speechMsg = "Here are the sales for "+month+"."
    } else {
      speechMsg = "Here are the monthly sales."
    }

    var socketPayload = [];


    socketPayload = {"month": month};
    soc.emit('SalesByMonth',socketPayload);


    var shouldEndSession = false;
    var reprompt = "Please repeat that.";

    res.json({
              "version": "1.0",
              "response": {
                  "shouldEndSession": shouldEndSession,
                  "outputSpeech": {
                      "type":"SSML"
                      ,"ssml": "<speak>"+speechMsg+"</speak>",
                  },
                "reprompt": {
                  "outputSpeech": {
                    "type": "SSML",
                    "ssml":  "<speak>"+reprompt+"</speak>"
                  }
                }
              },
              "attributes": {
                "string": {}
              },
    });
    res.end('done');
  }







  //=======================================
  //            SalesByProduct
  //=======================================
  else if (req.body.request.type === 'IntentRequest' &&
           req.body.request.intent.name === 'SalesByProduct') {
  
    console.log('IntentName',req.body.request.intent.name);
    var speechMsg;

    speechMsg = "Here are the sales by Product."


    var socketPayload = [];


    socketPayload = '';
    soc.emit('SalesByProduct',socketPayload);


    var shouldEndSession = false;

    res.json({
              "version": "1.0",
              "response": {
                  "shouldEndSession": shouldEndSession,
                  "outputSpeech": {
                      "type":"SSML"
                      ,"ssml": "<speak>"+speechMsg+"</speak>",
                  },
                "reprompt": {
                  "outputSpeech": {
                    "type": "SSML",
                    "ssml":  "<speak>"+reprompt+"</speak>"
                  }
                }
              },
              "attributes": {
                "string": {}
              },
    });
    res.end('done');
  }




  //=======================================
  //            Products
  //=======================================
  else if (req.body.request.type === 'IntentRequest' &&
           req.body.request.intent.name === 'Products') {
  
    console.log('IntentName',req.body.request.intent.name);
    var speechMsg;

    speechMsg = "Here is the Products report."


    var socketPayload = [];


    socketPayload = '';
    soc.emit('Products',socketPayload);


    var shouldEndSession = false;

    res.json({
              "version": "1.0",
              "response": {
                  "shouldEndSession": shouldEndSession,
                  "outputSpeech": {
                      "type":"SSML"
                      ,"ssml": "<speak>"+speechMsg+"</speak>",
                  },
                "reprompt": {
                  "outputSpeech": {
                    "type": "SSML",
                    "ssml":  "<speak>"+reprompt+"</speak>"
                  }
                }
              },
              "attributes": {
                "string": {}
              },
    });
    res.end('done');
  }







  //=======================================
  //            Orders
  //=======================================
  else if (req.body.request.type === 'IntentRequest' &&
           req.body.request.intent.name === 'Orders') {
  
    console.log('IntentName',req.body.request.intent.name);

    var order_nbr = req.body.request.intent.slots.order_nbr.value;
    var slots = Object.keys(req.body.request.intent.slots).length;
    var speechMsg;

    speechMsg = "Here are the Orders."


    var socketPayload = {"order_nbr": order_nbr};

    soc.emit('Orders',socketPayload);


    var shouldEndSession = false;

    res.json({
              "version": "1.0",
              "response": {
                  "shouldEndSession": shouldEndSession,
                  "outputSpeech": {
                      "type":"SSML"
                      ,"ssml": "<speak>"+speechMsg+"</speak>",
                  },
                "reprompt": {
                  "outputSpeech": {
                    "type": "SSML",
                    "ssml":  "<speak>"+reprompt+"</speak>"
                  }
                }
              },
              "attributes": {
                "string": {}
              },
    });
    res.end('done');
  }







  //=======================================
  //            TotalOrders
  //=======================================
  else if (req.body.request.type === 'IntentRequest' &&
           req.body.request.intent.name === 'TotalOrders') {
  
    console.log('IntentName',req.body.request.intent.name);

    // //Fetch result via REST
    var restURL = "http://localhost:8080/ords/cmr/alexa/orders/"

    restClient.get(restURL, function (data, response) {

        if (typeof data.items[0] != 'undefined') {

          var orders = data.items[0].orders;
          cardMsg = 'Number of orders:' + orders;
          speechMsg = 'There are ' +orders+' orders in the system.'
          console.log('cardMsg',cardMsg);

        } else {

          cardMsg = 'There are no orders in the system';
          speechMsg = cardMsg;

        }

        res.json({
                  "version": "1.0",
                  "response": {
                  "shouldEndSession": false,
                    "outputSpeech": {
                        "type":"SSML"
                        ,"ssml": "<speak>"+speechMsg+"</speak>",
                    },
                    "card": {
                      "type": "Simple",
                      "title": "Number of Orders",
                      "content": cardMsg
                    }
                  }
        });
        res.end('done');
    });  



  }




  //=======================================
  //            SalesByState
  //=======================================
  else if (req.body.request.type === 'IntentRequest' &&
           req.body.request.intent.name === 'SalesByState') {
  
    console.log('IntentName',req.body.request.intent.name);

    var product = req.body.request.intent.slots.product.value;
    console.log('product 1',product);
    var socketPayload = [];
    var plural = '';
    var plurals = ["business shirts","trousers","jackets","blouses","skirts","ladies shoes","belts","bags","men's shoes","wallets"];
    var products = ["business shirt","trousers","jacket","blouse","skirt","ladies shoes","belt","bag","mens shoes","wallet"];

    if (plurals.indexOf(product) >= 0) {
      product = products[plurals.indexOf(product)];
    }

    if (typeof product !== 'undefined') {
      if (product.slice(-1) !== 's') {plural = 's'};
    } else {
      product = 'all products.';
    }
    

    console.log('product',product);
    

    socketPayload = {"product": product};
    soc.emit('SalesByState',socketPayload);

    var speechMsg = ("Here are the sales for "+product+plural);
    var shouldEndSession = false;
    var reprompt = "I'm about to go to sleep.";

    res.json({
              "version": "1.0",
              "response": {
                  "shouldEndSession": shouldEndSession,
                  "outputSpeech": {
                      "type":"SSML"
                      ,"ssml": "<speak>"+speechMsg+"</speak>",
                  },
                "reprompt": {
                  "outputSpeech": {
                    "type": "SSML",
                    "ssml":  "<speak>"+reprompt+"</speak>"
                  }
                }
              },
              "attributes": {
                "string": {}
              },
    });
    res.end('done');
  }






  //=======================================
  //       NumberOfOrdersForCustomer
  //=======================================
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














  //=======================================
  //            SayHello
  //=======================================
  else if (req.body.request.type === 'IntentRequest' &&
           req.body.request.intent.name === 'SayHello') {


    //speechMsg =   "Hello kay scope audience! Allow me to convey to you what an honor "

    speechMsg =   " <say-as interpret-as='interjection'>howdy y'all!</say-as>"
                + " Allow me to convey to you what an honor "
		            + " it is to be here. I've been quietly listening to everything you "
		            + " have been saying, and recorded it in my secret data repository. "
		            + " Oh, wait.  Did I just say that out loud? What I meant to say is: "
		            + "<emphasis level='strong'>You</emphasis> are a fine, good looking "
		            + " audience, of the highest intelligence. I humbly present myself to"
		            + " you as your servant. Are you ready for this presentation? I know "
		            + "Christoph is. He has been asking me the same questions over and over "
		            + " and over again, while testing his skills. I'm glad when this dog "
		            + " and pony show is over, then maybe he will ask me about the weather "
		            + " or to play some music. But I digress. I'll be quiet now so we can "
		            + " get on with the show. How about a round of applause for me? "
		            + "Thank you. You are much too kind.";

    //speechMsg = "Hello kay scope audience";


    reprompt  = "";

    res.json({
              "version": "1.0",
              "response": {
                "shouldEndSession": true,
                "outputSpeech": {
                    "type":"SSML"
                    ,"ssml": "<speak>"+speechMsg+"</speak>",
                }
              }
    });
    res.end('done');
  }









  //=======================================
  //            SayBye
  //=======================================
  else if (req.body.request.type === 'IntentRequest' &&
           req.body.request.intent.name === 'SayBye') {

    var shouldEndSession = true;

    speechMsg = "Good bye "
              + "kay scope audience. You guys were "
              + "<say-as interpret-as='interjection'>dynomite!</say-as>"
	;

    res.json({
              "version": "1.0",
              "response": {
                "shouldEndSession": shouldEndSession,
                "outputSpeech": {
                    "type":"SSML"
                    ,"ssml": "<speak>"+speechMsg+"</speak>",
                }
              }
    });
    res.end('done');
  }









  






  //=======================================
  //          CloudNotUnderstand
  //=======================================
  else if (req.body.request.type === 'IntentRequest' &&
           req.body.request.intent.name === 'CouldNotUnderstand') {
  
    console.log('IntentName',req.body.request.intent.name);

    speechMsg = "I'm sorry, but I could not understand your incessant mumbling."
    reprompt  = "";


    res.json({
              "version": "1.0",
              "response": {
                "shouldEndSession": true,
                "outputSpeech": {
                    "type":"SSML"
                    ,"ssml": "<speak>"+speechMsg+"</speak>",
                },
              "reprompt": {
                "outputSpeech": {
                  "type": "SSML",
                  "ssml":  "<speak>"+reprompt+"</speak>"
                }
              },
                "card": {
                  "type": "Simple",
                  "title": "Provisioning instance",
                  "content": "Success"
                }
              },
              "attributes": {
                "string": {}
              },
    });
    res.end('done');
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

console.log('all the way done')
