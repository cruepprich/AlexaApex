# AlexaApex

This is the demo for AOLC running on WebPi

## Requirements:

* Self signed certificate and private-key located in 
  ```/etc/apache2/ssl/private-key.pem```
  ```/etc/apache2/ssl/certificate.pem```

* Apex application running on http://vbgeneric:8080

* Apex images directory on RPi in ```../apex\_images```

* Port forwarding of this RPi port 3000 to 80/443 on home router

* DNS Entry ruepprich.com pointing to home router

* Alexa skill configured for ```https://ruepprich.com/rest/alexaTest```

* Alexa self signed certificate ```/etc/apache2/ssl/certificate.pem```