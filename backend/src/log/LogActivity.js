import { Logs } from "../models/Logs.js";

export const logger = ({ httpMethod, endPoint, action, description, system }) => {
  try {
    void Logs.create({ httpMethod, endPoint, action, description, system });
  } catch (error) {
    console.log("ocurrio un error", error);
  }
};

