const firebase = require("firebase-admin");

// Best practice: Get the credential file and db url from environment varible
const serviceAccount = require("./serviceAccountKey.json");

module.exports = () => {
  firebase.initializeApp({
    credential: firebase.credential.cert(serviceAccount),
  });
  console.info("Initialized Firebase SDK");
};
