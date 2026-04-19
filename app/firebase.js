import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "ТВОЙ_API_KEY",
  authDomain: "ТВОЙ_DOMAIN",
  projectId: "ТВОЙ_PROJECT_ID",
  storageBucket: "ТВОЙ_BUCKET",
  messagingSenderId: "ТВОЙ_ID",
  appId: "ТВОЙ_APP_ID"
};

const app = initializeApp(firebaseConfig);

export default app;