import "dotenv/config";
import request from "request";
import { google } from "googleapis";
import mysql from "mysql";

// import a service account from /src directory
import key from "./service_account.json";

const connection = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "password",
  database: process.env.DB_NAME || "eiinbd",
});

var totalRow = 0;
var currentRow = 0;

// Generate JTW access token
const jwtClient = new google.auth.JWT(
  key.client_email,
  undefined,
  key.private_key,
  [
    "https://www.googleapis.com/auth/indexing",
    // "https://www.googleapis.com/auth/webmasters",
    // "https://www.googleapis.com/auth/webmasters.readonly",
  ],
  undefined
);

// Authorize and get the access token
jwtClient.authorize(async (err, tokens) => {
  if (err) {
    console.log(err);
    return;
  }

  // If get the access token then call to database that
  // these url was not request to index, so get these url with set a limit
  connection.query(
    "SELECT * from InstituteListClone where isIndex = false order by id desc limit 2 ",
    async function (error: any, results: any, fields: any) {
      if (error) throw error;
      const parsedData = JSON.parse(JSON.stringify(results));
      totalRow = parsedData.length;
      for (const data of parsedData) {
        const id = data.id;
        const url = `https://eiinbd.howdo.live/${data.slug}`;
        // Check if this url requested for index
        checkAndRequestToIndex(url, tokens, id);
        currentRow += 1;
      }
    }
  );

  // connection.end();
});

const checkAndRequestToIndex = (url: string, tokens: any, id: string) => {
  const urlEncode = encodeURI(url);

  let getOptions = {
    url: `https://indexing.googleapis.com/v3/urlNotifications/metadata?url=${urlEncode}`,
    method: "GET",
    // Your options, which must include the Content-Type and auth headers
    headers: {
      "Content-Type": "application/json",
    },
    auth: { bearer: tokens.access_token },
  };
  request(getOptions, function (error: any, response: any, body: any) {
    // Handle the response
    const parse = JSON.parse(body);
    if (parse.error?.code == 404) {
      // If the url was not request for index then call to the request to index
      requestToIndex(urlEncode, tokens, id);
    }
    console.log(parse);
  });
};

const requestToIndex = (url: string, tokens: any, id: string) => {
  let options = {
    url: "https://indexing.googleapis.com/v3/urlNotifications:publish",
    method: "POST",
    // Your options, which must include the Content-Type and auth headers
    headers: {
      "Content-Type": "application/json",
    },
    auth: { bearer: tokens.access_token },
    // Define contents here. The structure of the content is described in the next step.
    json: {
      url: url,
      type: "URL_UPDATED",
    },
  };

  request(options, async function (error: any, response: any, body: any) {
    // Handle the response
    console.log(body);
    try {
      const parse = JSON.parse(body);
      // If the request will success then update the column isIndex to true
      if (parse.body?.code == 200) {
        await connection.query(
          "UPDATE InstituteListClone set isIndex = ? where id = ?",
          [true, id],
          function (error: any, results: any, fields: any) {
            if (error) throw error;
          }
        );
        if (totalRow == currentRow) {
          connection.end();
        }
      }
    } catch (error) {
      console.log("🚀 ~ file: index.ts ~ line 118 ~ error", error);
      connection.end();
    }
  });
};
