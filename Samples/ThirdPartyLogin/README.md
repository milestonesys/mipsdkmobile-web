Sample explanation:

- The code in this sample is used only to show the bookmarks functionality after login in with a 3rd-party provider.
- For reference how the 3rd-party provider functionality works check the following files:
## Samples\ThirdPartyLogin\thirdPartyLogin.html -> holds the html form of the login
## Samples\ThirdPartyLogin\js\sample.js -> from this file the ThirdPartyLoginManager is enabled & called
## Samples\lib\js\thirdPartyLoginManager.js -> this file holds the entire logic of 3rd-party login

## Localhost setup
-> If you use localhost the OKTA Sign-in redirect URIs should be: 
http://localhost/idp/signin-oidc  
https://localhost/idp/signin-oidc  
https://localhost:8082/IDP/signin-oidc 
"Make sure that the address where you are opening the sample from is added as valid Redirect URI address in your login provider. 
For instance https://MobileServerAddress:8082/IDP/signin-oidc "

-> The settings in Milestone XProtext Management Server should be: 
	- In the section RedirectURIs for web client you should add as valid RedirectUI the address where you are loading the samlpe from https://localhost:8082/XPMobileSDK/Samples/ThirdPartyLogin/thirdPartyLogin.html
	- In Milestone XProtect Mangement Client you should add as valid WebClient Return URI the address where you are loading the sample from. 
	- For instance https://MobileServerAddress:8082/XPMobileSDK/Samples/ThirdPartyLogin/thirdPartyLogin.html 

Then open your sample https://MobileServerAddress:8082/XPMobileSDK/Samples/ThirdPartyLogin/thirdPartyLogin.html  and explore!