import type { Response } from "express";
import { env } from "../config/env";

const isProduction = env.NODE_ENV === "production";

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
	res.cookie("access_token", accessToken, {
		httpOnly: true,
		secure: isProduction,
		sameSite: isProduction ? "strict" : "none",
		maxAge: 15 * 60 * 1000,
		path: "/",
	});
	res.cookie("refresh_token", refreshToken, {
		httpOnly: true,
		secure: isProduction,
		sameSite: isProduction ? "strict" : "none",
		maxAge: 7 * 24 * 60 * 60 * 1000,
		path: "/",
	});
}

// Clear both cookies on logout
export function clearAuthCookies(res: Response): void {
	res.clearCookie("access_token", { path: "/" });
	res.clearCookie("refresh_token", { path: "/" });
}
