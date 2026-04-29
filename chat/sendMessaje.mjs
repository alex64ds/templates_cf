import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
  DeleteItemCommand
} from "@aws-sdk/client-dynamodb";
import { ApiGatewayManagementApi } from "@aws-sdk/client-apigatewaymanagementapi";

const ddb = new DynamoDBClient({});
const CONNECTIONS_TABLE = "ChatConnections";
const MESSAGES_TABLE = "ChatMessages";
const ROOM_ID = "general";

export const handler = async (event) => {
  const { connectionId, domainName, stage } = event.requestContext;

  let body;
  try { body = JSON.parse(event.body); }
  catch { body = { data: event.body }; }

  const text = body.data?.trim() || "";
  if (!text) return { statusCode: 400 };

  // Obtener username
  const userItem = await ddb.send(new GetItemCommand({
    TableName: CONNECTIONS_TABLE,
    Key: { connectionId: { S: connectionId } }
  }));
  const username = userItem.Item?.username?.S || "Anon";
  const createdAt = new Date().toISOString();

  // Guardar mensaje
  await ddb.send(new PutItemCommand({
    TableName: MESSAGES_TABLE,
    Item: {
      roomId:    { S: ROOM_ID },
      createdAt: { S: createdAt },
      user:      { S: username },
      text:      { S: text }
    }
  }));

  // Obtener conexiones activas
  const conns = await ddb.send(new ScanCommand({ TableName: CONNECTIONS_TABLE }));

  const usersSet = new Set(conns.Items.map(item => item.username?.S || "Anon"));
  const users = Array.from(usersSet);

  const apiGw = new ApiGatewayManagementApi({
    endpoint: `https://${domainName}/${stage}`
  });

  const msg = { type: "message", user: username, text, createdAt, users };

  // Broadcast a todos
  for (const conn of conns.Items) {
    try {
      await apiGw.postToConnection({
        ConnectionId: conn.connectionId.S,
        Data: Buffer.from(JSON.stringify(msg))
      });
    } catch (err) {
      // Conexión muerta, limpiar
      await ddb.send(new DeleteItemCommand({
        TableName: CONNECTIONS_TABLE,
        Key: { connectionId: { S: conn.connectionId.S } }
      }));
    }
  }

  return { statusCode: 200 };
};