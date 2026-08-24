import { FastifyPluginAsync } from "fastify";
import {
  SuggestCategorySchema,
  CheckDuplicatesSchema,
} from "@pocketlens/shared";
import { categorizationService } from "../services/categorization.js";
import { duplicateDetectionService } from "../services/duplicates.js";
import { dataQualityService } from "../services/dataQuality.js";

export const intelligenceRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);

  // POST /categories/suggest
  fastify.post("/categories/suggest", async (request, reply) => {
    const parseResult = SuggestCategorySchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parseResult.error.errors[0]?.message || "Invalid category suggestion input",
      });
    }

    const userId = request.user.id;
    const suggestion = await categorizationService.suggestCategory(userId, parseResult.data);
    return reply.send(suggestion);
  });

  // POST /transactions/check-duplicates
  fastify.post("/transactions/check-duplicates", async (request, reply) => {
    const parseResult = CheckDuplicatesSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parseResult.error.errors[0]?.message || "Invalid duplicate check input",
      });
    }

    const userId = request.user.id;
    const result = await duplicateDetectionService.checkDuplicates(userId, parseResult.data);
    return reply.send(result);
  });

  // GET /analytics/data-quality
  fastify.get("/analytics/data-quality", async (request, reply) => {
    const userId = request.user.id;
    const report = await dataQualityService.getReport(userId);
    return reply.send(report);
  });
};
