import { getHeaderToken, verifyJWT } from "../libs/jwt.js";

const isAuthenticated = async (req, res, next) => {
  try {
    const authorizationHeader = req.headers["authorization"];

    if (!authorizationHeader)
      return res.status(401).json({ message: "No token, unauthorized" });

    const token = getHeaderToken(req);
    const verify = await verifyJWT(token);
    req.user = verify;

    next();
  } catch (error) {
    return res.status(500).json({
      message: error.message,
    });
  }
};

export { isAuthenticated };
