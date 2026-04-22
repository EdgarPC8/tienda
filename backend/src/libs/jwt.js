import jwt from "jsonwebtoken";

const SECRET = "privateKey";

function createAccessToken({ payload }) {
  return new Promise((resolve, reject) => {
    jwt.sign(
      payload,
      SECRET,
      { algorithm: "HS256", expiresIn: "1d" },
      (err, token) => {
        if (err) reject(err);
        resolve(token);
      }
    );
  });
}

function getHeaderToken(req) {
  return req.headers["authorization"].split(" ")[1];
}

function verifyJWT(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, SECRET, (err, decoded) => {
      if (err) reject(err);
      resolve(decoded);
    });
  });
}

export { createAccessToken, getHeaderToken, verifyJWT };
