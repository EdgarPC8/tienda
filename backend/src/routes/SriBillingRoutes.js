import { Router } from "express";
import {
  isAuthenticated,
  requireAdminOrProgrammer,
  requireStaff,
} from "../middlewares/authMiddelware.js";
import {
  getSriBillingSettings,
  putSriBillingSettings,
  uploadSriCertificate,
  deleteSriCertificate,
  sriCertificateUploadMiddleware,
  postEmitSriInvoice,
  getSriInvoices,
  getSriInvoiceById,
  postRefreshSriInvoice,
  postTestSriInvoiceEmail,
  postSendSriInvoiceEmail,
  postLookupPurchaseInvoice,
  sriRidePdfUploadMiddleware,
} from "../controllers/SriBillingController.js";

const router = Router();

router.get("/settings", isAuthenticated, requireStaff, getSriBillingSettings);
router.post(
  "/purchase-invoices/lookup",
  isAuthenticated,
  requireStaff,
  postLookupPurchaseInvoice,
);
router.put("/settings", isAuthenticated, requireAdminOrProgrammer, putSriBillingSettings);
router.post(
  "/certificate",
  isAuthenticated,
  requireAdminOrProgrammer,
  sriCertificateUploadMiddleware,
  uploadSriCertificate,
);
router.delete("/certificate", isAuthenticated, requireAdminOrProgrammer, deleteSriCertificate);
router.post(
  "/test-email",
  isAuthenticated,
  requireAdminOrProgrammer,
  postTestSriInvoiceEmail,
);

router.get("/invoices", isAuthenticated, requireStaff, getSriInvoices);
router.post("/invoices/emit", isAuthenticated, requireAdminOrProgrammer, postEmitSriInvoice);
router.post("/invoices/:id/refresh", isAuthenticated, requireAdminOrProgrammer, postRefreshSriInvoice);
router.post(
  "/invoices/:id/send-email",
  isAuthenticated,
  requireStaff,
  sriRidePdfUploadMiddleware,
  postSendSriInvoiceEmail,
);
router.get("/invoices/:id", isAuthenticated, requireStaff, getSriInvoiceById);

export default router;
