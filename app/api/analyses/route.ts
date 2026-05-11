import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg(
    new Pool({ connectionString: process.env.DATABASE_URL }),
  ),
});

export async function GET() {
  try {
    const analyses = await prisma.request.findMany({
      include: {
        source: true,
        summary: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return Response.json(analyses);
  } catch (error) {
    return Response.json(
      { error: "Failed to fetch analyses" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { id } = await req.json();

    if (!id) {
      return Response.json(
        { error: "Analysis ID is required" },
        { status: 400 },
      );
    }

    // Delete summary first (due to foreign key constraint)
    await prisma.summary.deleteMany({
      where: { requestId: id },
    });

    // Delete request
    await prisma.request.delete({
      where: { id },
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { error: "Failed to delete analysis" },
      { status: 500 },
    );
  }
}
