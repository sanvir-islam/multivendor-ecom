import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import proxy from "express-http-proxy";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pinoHttp from "pino-http";

const app = express();

// blocks bad headers
app.use(helmet());

//LOGGING: logs the request right as it arrives
app.use(
	pinoHttp({
		transport:
			process.env.NODE_ENV !== "production"
				? {
						target: "pino-pretty",
						options: { colorize: true, translateTime: "SYS:standard" },
					}
				: undefined,
		redact: ["req.headers.authorization", "req.headers.cookie"], // Hides tokens from your logs
	}),
);

// CORS & PARSERS
app.use(
	cors({
		origin: ["http://localhost:3000"],
		allowedHeaders: ["Authorization", "Content-Type"],
		credentials: true,
	}),
);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ limit: "2mb", extended: true }));
app.use(cookieParser());

// RATE LIMITING
app.set("trust proxy", 1);
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 100,
	message: { error: "Too many requests, please try again later." },
	standardHeaders: "draft-7",
	legacyHeaders: false,
});
app.use(limiter);

//auth
app.use(
	"/auth",
	proxy("http://localhost:6001", {
		// Ensures '/auth' when reaching the microservice
		proxyReqPathResolver: (req) => req.originalUrl,
	}),
);

// routes
app.get("/gateway-health", (_req, res) => {
	res.send({ message: "Welcome to api-gateway!" });
});

const port = process.env.PORT || 6000;
const server = app.listen(port, () => {
	console.log(`Listening at http://localhost:${port}/api`);
});
server.on("error", console.error);
