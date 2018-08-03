const fs = require('fs');
const path = require('path');
const jsyaml = require('js-yaml');
const root = require('app-root-path');

const helpers = require('../helpers');

const DEFAULTS = {
  name: 'fastify-oas',
  description: 'Fastify OpenAPI',
  version: '1.0.0',
  openapi: '3.0.0',
  host: '127.0.0.1',
  schemes: ['http'],
  basePath: '/',
  consumes: ['*/*'],
  produces: ['*/*'],
};

module.exports = ({options = {}, schemas = {}, routes = []} = {}) => {
  try {
    const data = fs.readFileSync(path.join(root.toString(), 'package.json'));
    const {name, description, version} = JSON.parse(data);
    if (name) DEFAULTS.name = name;
    if (description) DEFAULTS.description = description;
    if (version) DEFAULTS.version = version;
  } catch (_) {
    // do nothing
  }

  const cache = {
    swaggerObject: null,
    swaggerString: null,
  };

  const handler = (opts = {}) => {
    // opts = Object.assign({}, options, opts);

    const {
      yaml = false,
      swagger = {},
      openapi = DEFAULTS.openapi,
      addModels = false,
    } = Object.assign({}, options, opts);

    if (yaml) {
      if (cache.swaggerString) return cache.swaggerString;
    } else {
      if (cache.swaggerObject) return cache.swaggerObject;
    }

    const swaggerObject = {};
    swaggerObject.openapi = openapi;
    if (swagger.info) {
      swaggerObject.info = swagger.info;
    } else {
      swaggerObject.info = {
        title: DEFAULTS.name,
        description: DEFAULTS.description,
        version: DEFAULTS.version,
      };
    }
    swaggerObject.components = swagger.components || {};
    if (swagger.tags) {
      swaggerObject.tags = swagger.tags;
    }
    if (swagger.externalDocs) {
      swaggerObject.externalDocs = swagger.externalDocs;
    }
    if (swagger.security) {
      swaggerObject.security = swagger.security;
    }
    if (swagger.servers) {
      // openapi 3
      swaggerObject.servers = swagger.servers;
    } else {
      const host = swagger.host || DEFAULTS.host;
      const schemes = swagger.schemes || DEFAULTS.schemes;
      const basePath = swagger.basePath || DEFAULTS.basePath;
      // port from swagger 2
      swaggerObject.servers = schemes.map((sch) => {
        return {
          url: `${sch}://${host}${basePath}`,
        };
      });
    }
    if (swagger.securityDefinitions) {
      // swagger 2 securityDefinitions
      swaggerObject.components.securitySchemes = Object.assign(
        {},
        swaggerObject.components.securitySchemes,
        swagger.securityDefinitions
      );
    }
    const defaultConsumes = swagger.consumes || DEFAULTS.consumes;
    const defaultProduces = swagger.produces || DEFAULTS.produces;

    if (addModels) {
      const schemaKeys = Object.keys(schemas);
      swaggerObject.components.schemas = swaggerObject.components.schemas || {};
      const schemaDst = swaggerObject.components.schemas;

      for (const schemaKey of schemaKeys) {
        const schema = helpers.clone(schemas[schemaKey]);
        const id = schema.$id;
        delete schema.$id;
        schemaDst[id] = schema;
      }
    }
    swaggerObject.paths = {};

    for (const route of routes) {
      if (route.schema && route.schema.hide) {
        continue;
      }
      const schema = route.schema;
      const url = helpers.formatParamUrl(route.url);
      const swaggerRoute = swaggerObject.paths[url] || {};
      const swaggerMethod = {
        responses: {},
      };
      const parameters = [];
      const methods =
        typeof route.method === 'string' ? [route.method] : route.method;
      for (const method of methods) {
        swaggerRoute[method.toLowerCase()] = swaggerMethod;
      }
      if (schema) {
        schema.consumes = schema.consumes || defaultConsumes;
        schema.produces = schema.produces || defaultProduces;
        if (schema.summary) {
          swaggerMethod.summary = schema.summary;
        }

        if (schema.description) {
          swaggerMethod.description = schema.description;
        }

        if (schema.tags) {
          swaggerMethod.tags = schema.tags;
        }

        if (schema.deprecated) {
          swaggerMethod.deprecated = schema.deprecated;
        }

        if (schema.security) {
          swaggerMethod.security = schema.security;
        }

        if (schema.querystring) {
          helpers.genQuery(parameters, schema.querystring);
        }

        if (schema.body) {
          swaggerMethod.requestBody = {};
          helpers.genBody(
            swaggerMethod.requestBody,
            schema.body,
            schema.consumes
          );
        }

        if (schema.params) {
          helpers.genPath(parameters, schema.params);
        }

        if (schema.headers) {
          helpers.genHeaders(parameters, schema.headers);
        }

        // if (schema.response) {
        helpers.genResponse(
          swaggerMethod.responses,
          schema.response,
          schema.produces
        );
        // }

        if (parameters.length) {
          swaggerMethod.parameters = parameters;
        }
      }
      swaggerObject.paths[url] = swaggerRoute;
    }

    if (yaml) {
      const swaggerString = jsyaml.safeDump(swaggerObject, {skipInvalid: true});
      cache.swaggerString = swaggerString;
      return swaggerString;
    }

    cache.swaggerObject = swaggerObject;
    return swaggerObject;
  };
  return handler;
};