import { Router } from "express";
import proxy from "express-http-proxy";
import { logger } from "../config/logger";

const router: Router = Router();

function proxyTo(target: string) {
	return proxy(target, {
		proxyReqPathResolver: (req) => req.url,
		proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
			// Explicit: forward the request ID so downstream logs share the same trace
			proxyReqOpts.headers = {
				...proxyReqOpts.headers,
				"x-request-id": srcReq.headers["x-request-id"] as string,
			};
			return proxyReqOpts;
		},
		proxyErrorHandler: (err, res, _next) => {
			logger.error({ err: err.message, target }, "Proxy error");
			res.status(502).json({
				success: false,
				message: "Service temporarily unavailable",
			});
		},
	});
}

// Define all your microservice proxies here
router.use("/auth", proxyTo("http://localhost:6001"));

// router.use("/users", proxyTo("http://localhost:6002", "/users"));
// router.use("/orders", proxyTo("http://localhost:6003", "/orders"));
// router.use("/products", proxyTo("http://localhost:6004", "/products"));

export default router;
