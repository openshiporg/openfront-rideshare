import { keystoneContext } from '../../features/keystone/context'
import { graphqlQueryShapeGuardPlugin } from '../../features/keystone/domain/graphqlQueryShape'
import { createYoga } from "graphql-yoga";
// @ts-ignore
import processRequest from "graphql-upload/processRequest.js";
import { type NextApiRequest, type NextApiResponse } from 'next'
import { Readable } from 'node:stream'
import { BodyLimitError, readBoundedBody } from '../../features/keystone/domain/boundedBody'

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.NODE_ENV === 'production' && req.method === 'GET' && String(req.headers.accept || '').includes('text/html')) return res.status(404).end()

  const contentType = String(req.headers['content-type'] || '')
  const maxBodyBytes = contentType.startsWith('multipart/form-data') ? 16 * 1024 * 1024 : 1024 * 1024
  let input = req
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      const body = await readBoundedBody(req, req.headers['content-length'], maxBodyBytes)
      // Replay the fully bounded bytes through the pinned Node/Yoga adapter;
      // the original request remains the native session context. Never hand
      // Yoga the consumed input stream or silently remove upload support.
      input = Object.assign(Readable.from([body]), { headers: { ...req.headers, 'content-length': String(body.length) }, method: req.method, url: req.url, httpVersion: req.httpVersion, httpVersionMajor: req.httpVersionMajor, httpVersionMinor: req.httpVersionMinor, socket: req.socket, query: req.query, cookies: req.cookies }) as NextApiRequest
    } catch (error) {
      if (res.destroyed || res.writableEnded) return
      res.setHeader('Connection', 'close')
      res.once('finish', () => req.destroy())
      return res.status(error instanceof BodyLimitError ? error.status : 400).json({ errors: [{ message: error instanceof BodyLimitError && error.status === 413 ? 'GraphQL request body is too large.' : 'GraphQL request body is invalid or incomplete.' }] })
    }
  }
  if (contentType.startsWith('multipart/form-data')) {
    input.body = await processRequest(input, res, { maxFieldSize: 128 * 1024, maxFileSize: 5 * 1024 * 1024, maxFiles: 3 });
  }

  return createYoga({
    renderGraphiQL: () => {
      return `
        <!DOCTYPE html>
        <html lang="en">
          <body style="margin: 0; overflow-x: hidden; overflow-y: hidden">
          <div id="sandbox" style="height:100vh; width:100vw;"></div>
          <script src="https://embeddable-sandbox.cdn.apollographql.com/_latest/embeddable-sandbox.umd.production.min.js"></script>
          <script>
          new window.EmbeddedSandbox({
            target: "#sandbox",
            // Pass through your server href if you are embedding on an endpoint.
            // Otherwise, you can pass whatever endpoint you want Sandbox to start up with here.
            initialEndpoint: window.location.href,
            hideCookieToggle: false,
            initialState: {
              includeCookies: true
            }
          });
          // advanced options: https://www.apollographql.com/docs/studio/explorer/sandbox#embedding-sandbox
          </script>
          </body>
        </html>`;
    },
    graphqlEndpoint: "/api/graphql",
    schema: keystoneContext.graphql.schema,
    context: () => {
      return keystoneContext.withRequest(req, res);
    },
    multipart: false,
    plugins: [graphqlQueryShapeGuardPlugin],
  })(input, res);
}
