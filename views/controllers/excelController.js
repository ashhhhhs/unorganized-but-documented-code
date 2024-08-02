const excelToJson = require('convert-excel-to-json');
const path = require('path');

async function routes(fastify, options) {
  fastify.post('/upload', async (request, reply) => {
    const file = request.raw.files.file;
    const filePath = path.join(__dirname, '..', 'uploads', file.name);

    // Save the file
    await file.mv(filePath);

    // Convert Excel to JSON
    const result = excelToJson({
      sourceFile: filePath
    });

    reply.send(result);
  });
}

module.exports = routes;
