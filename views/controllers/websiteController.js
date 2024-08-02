const Website = require('../models/Website');

async function routes(fastify, options) {
  fastify.get('/', async (request, reply) => {
    const websites = await Website.find();
    reply.send(websites);
  });

  fastify.post('/', async (request, reply) => {
    const newWebsite = new Website(request.body);
    await newWebsite.save();
    reply.send(newWebsite);
  });

  fastify.get('/:id', async (request, reply) => {
    const website = await Website.findById(request.params.id);
    reply.send(website);
  });

  fastify.put('/:id', async (request, reply) => {
    const website = await Website.findByIdAndUpdate(request.params.id, request.body, { new: true });
    reply.send(website);
  });

  fastify.delete('/:id', async (request, reply) => {
    await Website.findByIdAndDelete(request.params.id);
    reply.send({ message: 'Website deleted' });
  });
}

module.exports = routes;
