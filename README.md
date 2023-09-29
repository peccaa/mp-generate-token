# mp-generate-token

1. cd to ./certs
2. create private key and name it as private.pem:
   on mac -> openssl genrsa -out private.pem 3072 (at least 2048 bits key)
   on windows -> ssh-keygen -t rsa -b "3072"
3. run the applikasjon from the app directory:
   npm install
   npm run dev
4. The applikasjon will run on http://localhost:4000
5. Go to http://localhost:4000/jwks, get the public jwks needed in selvebetjeningsportalen (you know what to do!!)
6. Go to http://localhost:4000/jwt_token, use this key/token to get the accesstoken for the api
7. Go to postman, you can use curl or another client and send the following request:
   curl -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion={jwt-token from step 6}"
   -H "Content-Type: application/x-www-form-urlencoded" -X POST https://ver2.maskinporten.no/token
8. Connect to api with obteined accessToken:
   curl -x GET https://##############/tildelinger/v1
   -H "Authorization: Bearer {accessToken}
9. You will get a nice welcome message from API :-)
