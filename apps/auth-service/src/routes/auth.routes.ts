import { requireAuth, requireRole, validate } from "@multivendor-ecom/shared";
import { Router } from "express";
import {
	changePasswordBody,
	changeRoleBody,
	deleteAccountBody,
	forgotPasswordBody,
	loginBody,
	paginationQuery,
	registerBody,
	resendVerificationBody,
	resetPasswordBody,
	sessionIdParams,
	userIdParams,
	verifyEmailBody,
} from "../schemas/auth.schema";
import * as controller from "../controller/auth.controller";

const router: Router = Router();

// ──── Public routes (no auth required) ────
router.post("/register", validate({ body: registerBody }), controller.register);
router.post("/login", validate({ body: loginBody }), controller.login);
router.post("/refresh", controller.refreshToken);
router.post("/verify-email", validate({ body: verifyEmailBody }), controller.verifyEmail);
router.post("/resend-verification", validate({ body: resendVerificationBody }), controller.resendVerification);
router.post("/forgot-password", validate({ body: forgotPasswordBody }), controller.forgotPassword);
router.post("/reset-password", validate({ body: resetPasswordBody }), controller.resetPassword);

// ──────────────────────────────────────────────
router.use(requireAuth);

// ──── Protected routes (any authenticated user) ────
// These require x-user-id header from API Gateway
router.post("/logout", controller.logout);
router.post("/logout-all", controller.logoutAll);
router.post("/change-password", validate({ body: changePasswordBody }), controller.changePassword);
router.get("/me", controller.getMe);
router.post("/me/deactivate", validate({ body: deleteAccountBody }), controller.deleteAccount);
router.get("/sessions", controller.getSessions);
router.delete("/sessions/:tokenId", validate({ params: sessionIdParams }), controller.revokeSession);

// ──── Admin routes ────
router.get("/users", requireRole(["ADMIN"]), validate({ query: paginationQuery }), controller.listUsers);
router.patch("/users/:userId/block", requireRole(["ADMIN"]), validate({ params: userIdParams }), controller.blockUser);
router.patch("/users/:userId/unblock", requireRole(["ADMIN"]), validate({ params: userIdParams }), controller.unblockUser);
router.patch(
	"/users/:userId/role",
	requireRole(["ADMIN"]),
	validate({ params: userIdParams, body: changeRoleBody }),
	controller.changeUserRole,
);

// ──── Internal routes (Secured via API Gateway / internal VPC only) ────
// router.post("/internal/cron/cleanup-tokens", controller.triggerTokenCleanup);
export default router;
