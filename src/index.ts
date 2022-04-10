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
    "SELECT * from InstituteListClone where isIndex = 0 order by id desc limit 50 ",
    async function (error: any, results: any, fields: any) {
      if (error) throw error;
      const parsedData = JSON.parse(JSON.stringify(results));
      totalRow = parsedData.length;
      for (const data of parsedData) {
        const id = data.id;
        const url = `https://eiinbd.howdo.live/${data.slug}`;
        const urlEncode = encodeURI(url);

        // Check if this url requested for index
        const check = checkIsIndex(urlEncode, tokens);
        check.then(async (data) => {
          // @ts-ignore
          if (data.error?.code == 404) {
            // If the url was not request for index then call to the request to index
            await requestToIndex(urlEncode, tokens, id);
          } else {
            await updateTableSetIndex(id);
          }
          console.log(
            "🚀 ~ file: index.ts ~ line 55 ~ check.then ~ data",
            data
          );
        });

        // console.log("🚀 ~ file: index.ts ~ line 52 ~ check", check);
        // @ts-ignore
        // if (check.error?.code == 404) {
        //   // If the url was not request for index then call to the request to index
        //   await requestToIndex(urlEncode, tokens, id);
        // } else {
        //   await updateTableSetIndex(id);
        // }
      }
    }
  );
});

const checkIsIndex = (url: string, tokens: any) => {
  return new Promise((resolve) => {
    let getOptions = {
      url: `https://indexing.googleapis.com/v3/urlNotifications/metadata?url=${url}`,
      method: "GET",
      // Your options, which must include the Content-Type and auth headers
      headers: {
        "Content-Type": "application/json",
      },
      auth: { bearer: tokens.access_token },
    };
    request(getOptions, async function (error: any, response: any, body: any) {
      const parse = JSON.parse(body);
      resolve(parse);
    });
  });
};

const requestToIndex = (url: string, tokens: any, id: string) => {
  return new Promise((resolve) => {
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
        // If the request will success then update the column isIndex to true
        if (!body.error?.code) {
          await updateTableSetIndex(id);
        }
      } catch (error) {
        console.log("🚀 ~ file: index.ts ~ line 118 ~ error", error);
        connection.end();
      }
    });
  });
};

const updateTableSetIndex = (id: string) => {
  return new Promise((resolve, reject) => {
    connection.query(
      "UPDATE InstituteListClone set isIndex = ? where id = ?",
      [true, id],
      function (error: any, results: any, fields: any) {
        if (error) {
          reject(error);
        } else {
          resolve(results);
        }
      }
    );
    currentRow += 1;
    if (totalRow == currentRow) {
      connection.end();
    }
    console.log("🚀 ~ loop at now : ", currentRow);
  });
};
