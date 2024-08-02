const fastify = require('fastify')({ logger: true });
const path = require('path');
const mongoose = require('mongoose');
const fastifyCors = require('@fastify/cors');
const dotenv = require('dotenv');
const ejs = require('ejs');
const fastifyJwt = require('@fastify/jwt');
const fastifyMultipart = require('@fastify/multipart');
const xlsx = require('xlsx');
const fastifyView = require('@fastify/view');
const fastifySwagger = require("@fastify/swagger");
const fastifySwaggerUI = require("@fastify/swagger-ui");

dotenv.config();

const setupSwagger = async () => {
  await fastify.register(fastifySwagger, {
    routePrefix: '/documentation',
    openapi: {
      info: {
        title: 'Test Swagger',
        description: 'Testing the Fastify Swagger API',
        version: '0.1.0'
      },
      servers: [{
        url: 'http://localhost:3000'
      }],
      components: {
        securitySchemes: {
          apiKey: {
            type: 'apiKey',
            name: 'apiKey',
            in: 'header'
          }
        }
      }
    },
    hideUntagged: true,
    exposeRoute: true
  });

  await fastify.register(fastifySwaggerUI, {
    routePrefix: '/documentation',
    swagger: {
      info: {
        title: 'Test API',
        description: 'Testing the Fastify Swagger API',
        version: '0.1.0'
      },
      externalDocs: {
        url: 'https://swagger.io',
        description: 'Find more info here'
      },
      host: 'localhost:3000',
      schemes: ['http'],
      consumes: ['application/json'],
      produces: ['application/json'],
      securityDefinitions: {
        apiKey: {
          type: 'apiKey',
          name: 'apiKey',
          in: 'header'
        }
      }
    },
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false
    },
    uiHooks: {
      onRequest: function (request, reply, next) { next(); },
      preHandler: function (request, reply, next) { next(); }
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
    transformSpecification: (swaggerObject, request, reply) => swaggerObject,
    transformSpecificationClone: true
  });

  fastify.addHook('onReady', () => {
    console.log(fastify.swagger());
  });
};

const setupMongoDB = async () => {
  await mongoose.connect('mongodb://localhost:27017/dashboardDB')
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log(err));
};

const setupModels = () => {
  const templateSchema = new mongoose.Schema({
    category: String,
    template_name: String,
  });

  const sectionSchema = new mongoose.Schema({
    template: templateSchema,
    data: Map,
    order: Number
  });

  const themeSchema = new mongoose.Schema({
    colors: Map,
    fonts: Map,
  });

  const companySchema = new mongoose.Schema({
    name: String,
    address: String,
    phone: String,
    logo: String,
    slug: String,
    theme: themeSchema,
    sections: [sectionSchema],
  });

  mongoose.model('Company', companySchema);
  mongoose.model('Theme', themeSchema);
  mongoose.model('Section', sectionSchema);
  mongoose.model('Template', templateSchema);
};

const setupMiddleware = () => {
  fastify.register(fastifyCors, { origin: '*' });
  fastify.register(fastifyJwt, { secret: process.env.JWT_SECRET });
  fastify.register(fastifyView, { engine: { ejs } });
  fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, 'assets'),
    prefix: '/assets/',
  });
  fastify.register(fastifyMultipart);
};

const renderTemplate = async (req, reply) => {
  try {
    const slug = req.params.slug;
    const Company = mongoose.model('Company');
    const company = await Company.findOne({ slug });

    if (!company) {
      reply.status(404).send('Not Found');
      return;
    }

    const sectionMap = {
      "header 1": "header/header1.ejs",
      "footer 1": "footer/footer1.ejs",
    };

    company.sections.sort((a, b) => a.order - b.order);
    const data = { ...company.toObject(), url: process.env.BASE_URL + req.url };

    reply.view('layout.ejs', { data, sectionMap });
  } catch (err) {
    console.error(`Error: ${err}`);
    reply.status(500).send('Internal Server Error');
  }
};

const setupRoutes = () => {
  fastify.decorate("authenticate", async function (req, reply) {
    try {
      await req.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  fastify.get('/ping', {
    schema: {
      description: 'Ping route to check the server status',
      tags: ['utility'],
      response: {
        200: {
          type: 'string',
          example: 'pong 🏓'
        }
      }
    }
  }, async (req, reply) => {
    reply.send('pong 🏓');
  });

  fastify.get('/', {
    schema: {
      description: 'Get all companies',
      tags: ['company'],
      querystring: {
        name: { type: 'string' },
        address: { type: 'string' }
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              address: { type: 'string' },
              phone: { type: 'string' },
              logo: { type: 'string' },
              slug: { type: 'string' }
            }
          }
        }
      }
    }
  }, async (req, reply) => {
    try {
      const { name, address } = req.query;
      const filter = {};
      if (name) filter.name = new RegExp(name, 'i');
      if (address) filter.address = new RegExp(address, 'i');

      const Company = mongoose.model('Company');
      const data = await Company.find(filter);
      reply.status(200).send(data);
    } catch (err) {
      reply.status(500).send(err);
    }
  });

  fastify.get('/:slug/*', {
    schema: {
      description: 'Render template based on slug',
      tags: ['template'],
      params: {
        slug: { type: 'string' }
      },
      response: {
        200: {
          type: 'string'
        }
      }
    }
  }, async (req, reply) => {
    await renderTemplate(req, reply);
  });

  fastify.get('/templates', {
    schema: {
      description: 'Get all templates',
      tags: ['template'],
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              category: { type: 'string' },
              template_name: { type: 'string' }
            }
          }
        }
      }
    }
  }, async (req, reply) => {
    try {
      const Template = mongoose.model('Template');
      const templates = await Template.find();
      reply.send(templates);
    } catch (err) {
      reply.status(500).send(err);
    }
  });

  fastify.post('/company', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Create a new company',
      tags: ['company'],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          address: { type: 'string' },
          phone: { type: 'string' },
          logo: { type: 'string' },
          slug: { type: 'string' },
          theme: { type: 'object' },
          sections: { type: 'array' }
        }
      },
      response: {
        201: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            address: { type: 'string' },
            phone: { type: 'string' },
            logo: { type: 'string' },
            slug: { type: 'string' }
          }
        }
      }
    }
  }, async (req, reply) => {
    try {
      const Company = mongoose.model('Company');
      const company = new Company(req.body);
      await company.save();
      reply.status(201).send(company);
    } catch (err) {
      reply.status(500).send(err);
    }
  });

  fastify.get('/company/:id', {
    schema: {
      description: 'Get a company by ID',
      tags: ['company'],
      params: {
        id: { type: 'string' }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            address: { type: 'string' },
            phone: { type: 'string' },
            logo: { type: 'string' },
            slug: { type: 'string' }
          }
        }
      }
    }
  }, async (req, reply) => {
    try {
      const Company = mongoose.model('Company');
      const company = await Company.findById(req.params.id);
      if (!company) {
        reply.status(404).send('Not Found');
        return;
      }
      reply.send(company);
    } catch (err) {
      reply.status(500).send(err);
    }
  });

  fastify.get('/company/:id/sections', {
    schema: {
      description: 'Get sections of a company by company ID',
      tags: ['company'],
      params: {
        id: { type: 'string' }
      },
      response: {
        200: {
          type: 'array',
          items: {
            type: 'object'
          }
        }
      }
    }
  }, async (req, reply) => {
    try {
      const Company = mongoose.model('Company');
      const company = await Company.findById(req.params.id);
      if (!company) {
        reply.status(404).send('Not Found');
        return;
      }
      reply.send(company.sections);
    } catch (err) {
      reply.status(500).send(err);
    }
  });

  fastify.post('/company/upload', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Upload company data',
      tags: ['company'],
      response: {
        200: {
          type: 'array',
          items: { type: 'object' }
        }
      }
    },
    handler: async (req, reply) => {
      const data = await req.file();
      const buffer = await data.toBuffer();
      const workbook = xlsx.read(buffer, { type: 'buffer' });
      const sheetName = workbook.sheetNames[0];
      const sheetData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
      reply.send(sheetData);
    }
  });

  fastify.post('/company/create-template', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Create a template from uploaded data',
      tags: ['template'],
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            template: { type: 'object' }
          }
        }
      }
    },
    handler: async (req, reply) => {
      const sheetData = req.session.sheetData;
      if (!sheetData) {
        return reply.status(400).send({ error: 'No uploaded file data found' });
      }
      const Template = mongoose.model('Template');
      const template = await Template.create(sheetData);
      reply.send({ message: 'Template created', template });
    }
  });

  fastify.put('/company/:id', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Update a company by ID',
      tags: ['company'],
      params: {
        id: { type: 'string' }
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          address: { type: 'string' },
          phone: { type: 'string' },
          logo: { type: 'string' },
          slug: { type: 'string' },
          theme: { type: 'object' },
          sections: { type: 'array' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            address: { type: 'string' },
            phone: { type: 'string' },
            logo: { type: 'string' },
            slug: { type: 'string' }
          }
        }
      }
    }
  }, async (req, reply) => {
    try {
      const Company = mongoose.model('Company');
      const company = await Company.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!company) {
        reply.status(404).send('Not Found');
        return;
      }
      reply.send(company);
    } catch (err) {
      reply.status(500).send(err);
    }
  });

  fastify.put('/company/:id/sections', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Add a section to a company by ID',
      tags: ['company'],
      params: {
        id: { type: 'string' }
      },
      body: {
        type: 'object',
        properties: {
          template: { type: 'object' },
          data: { type: 'object' },
          order: { type: 'number' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            address: { type: 'string' },
            phone: { type: 'string' },
            logo: { type: 'string' },
            slug: { type: 'string' }
          }
        }
      }
    }
  }, async (req, reply) => {
    try {
      const Company = mongoose.model('Company');
      const company = await Company.findById(req.params.id);
      if (!company) {
        reply.status(404).send('Not Found');
        return;
      }
      const Section = mongoose.model('Section');
      const section = new Section(req.body);
      company.sections.push(section);
      await company.save();
      reply.send(company);
    } catch (err) {
      reply.status(500).send(err);
    }
  });

  fastify.delete('/company/:id', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Delete a company by ID',
      tags: ['company'],
      params: {
        id: { type: 'string' }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (req, reply) => {
    try {
      const Company = mongoose.model('Company');
      const company = await Company.findByIdAndDelete(req.params.id);
      if (!company) {
        reply.status(404).send('Not Found');
        return;
      }
      reply.send({ message: 'Company deleted' });
    } catch (err) {
      reply.status(500).send(err);
    }
  });

  fastify.get('/render/:id', {
    schema: {
      description: 'Render company by slug',
      tags: ['template'],
      params: {
        id: { type: 'string' }
      },
      response: {
        200: {
          type: 'string'
        }
      }
    }
  }, async (req, reply) => {
    const Company = mongoose.model('Company');
    const company = await Company.findOne({ slug: req.params.id }).lean();
    const data = {
      sections: company.sections.map(e => ({
        ...e,
        temp_location: e.template.category + '/' + e.template.template_name,
      })),
      company
    };
    return reply.viewAsync('views/render.ejs', data);
  });
};

const startServer = async () => {
  try {
    await setupSwagger();
    await setupMongoDB();
    setupModels();
    setupMiddleware();
    setupRoutes();

    fastify.listen({ port: 3000 }, (err, address) => {
      if (err) {
        fastify.log.error(err);
        process.exit(1);
      }
      console.log(`Server listening on ${address}`);
      console.log('Swagger docs available at http://localhost:3000/documentation');
    });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

startServer();
