import { prisma } from "../../config/database";

export async function cleanupExpiredTokens() {
	const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

	const result = await prisma.refreshToken.deleteMany({
		where: {
			OR: [{ expiresAt: { lt: new Date() } }, { isRevoked: true, createdAt: { lt: sevenDaysAgo } }],
		},
	});

	return { deleted: result.count };
}
