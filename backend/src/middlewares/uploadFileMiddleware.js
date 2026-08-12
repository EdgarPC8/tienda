import multer from "multer";
import { join } from "path";
import fileDirName from "../libs/file-dirname.js";

const { __dirname } = fileDirName(import.meta);

const diskStorageForCSV = multer.diskStorage({
  destination: join(__dirname, "../../files"),
  filename: (req, file, callback) => {
    const csvFileName = `${
      Date.now() + "-" + Math.round(Math.random() * 1e9)
    }.csv`;
    callback(null, csvFileName);
  },
});

const diskStorageToUpdateCSV = multer.diskStorage({
  destination: join(__dirname, "../../files"),
  filename: async (req, file, callback) => {
    // Lógica de actualización si es necesario
    // Similar a diskStorageToUpdatePhoto
  },
});

const uploadCSV = multer({ storage: diskStorageForCSV }).single("csvFile");
const uploadUpdateCSV = multer({ storage: diskStorageToUpdateCSV }).single(
  "csvFile",
);

export { uploadCSV, uploadUpdateCSV };
