import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { errorMiddleware } from "@multivendor-ecom/shared";

const app = express();
app.use(
	cors({
		origin: ["http://localhost:3000"],
		allowedHeaders: ["Authorization", "Content-Type"],
		credentials: true,
	}),
);
app.use(express.json());

app.use(cookieParser());

app.get("/", (_req, res) => {
	console.log("got hit");
	res.send({ message: "Hello API, I am auth" });
});

app.use(errorMiddleware);
const port = process.env.PORT ? Number(process.env.PORT) : 6001;
const server = app.listen(port, () => {
	console.log(`Auth service in running at http://localhost:${port}/api`);
});
server.on("error", (err) => {
	console.log("Server error: ", err);
});
