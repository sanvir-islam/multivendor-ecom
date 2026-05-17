import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";

export interface RequestSchemas {
	body?: ZodType;
	params?: ZodType;
	query?: ZodType;
}

export function validate(schemas: RequestSchemas) {
	return (req: Request, res: Response, next: NextFunction): void => {
		const errors: { field: string; message: string }[] = [];

		// The exact request properties we are allowed to validate
		const validationKeys = ["body", "params", "query"] as const;

		for (const key of validationKeys) {
			const schema = schemas[key];

			if (schema) {
				// Parse the incoming raw data (e.g., req.body)
				const result = schema.safeParse(req[key]);

				if (!result.success) {
					// If it fails, extract all errors and format them beautifully
					for (const issue of result.error.issues) {
						errors.push({
							field: `${key}.${issue.path.join(".")}`, // e.g., "body.email"
							message: issue.message,
						});
					}
				} else {
					// If it succeeds, reassign the clean, stripped, and coerced data back to Express.
					if (key === "body") {
						req.body = result.data;
					} else if (key === "params") {
						req.params = result.data as unknown as Request["params"];
					} else if (key === "query") {
						req.query = result.data as unknown as Request["query"];
					}
				}
			}
		}

		// If we accumulated any errors from the body, params, or query, reject the request
		if (errors.length > 0) {
			res.status(400).json({
				success: false,
				message: "Validation failed",
				errors,
			});
			return;
		}

		// Everything is perfectly clean and typed. Proceed to the controller!
		next();
	};
}
