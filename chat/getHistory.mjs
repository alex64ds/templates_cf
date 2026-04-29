import {
  DynamoDBClient,
  ScanCommand
} from "@aws-sdk/client-dynamodb";

import {
  ApiGatewayManagementApi
} from "@aws-sdk/client-apigatewaymanagementapi";

const ddb = new DynamoDBClient({});

const CONNECTIONS_TABLE = "ChatConnections";
const MESSAGES_TABLE = "ChatMessages";
const ROOM_ID = "general";

export const handler = async (event) => {
  const { connectionId, domainName, stage } = event.requestContext;

  // 1. Obtener mensajes
  const messagesResult = await ddb.send(new ScanCommand({
    TableName: MESSAGES_TABLE,
    FilterExpression: "roomId = :room",
    ExpressionAttributeValues: {
      ":room": { S: ROOM_ID }
    }
  }));

  const messages = (messagesResult.Items || [])
    .map(item => ({
      user: item.user?.S || "Anon",
      text: item.text?.S || "",
      createdAt: new Date(item.createdAt?.S || 0).getTime()
    }))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5)
    .reverse();

  // 2. Obtener usuarios conectados
  const connsResult = await ddb.send(new ScanCommand({
    TableName: CONNECTIONS_TABLE
  }));

  const users = Array.from(new Set(
    (connsResult.Items || []).map(item => item.username?.S || "Anon")
  ));

  // 3. Enviar respuesta SOLO al cliente
  const apiGw = new ApiGatewayManagementApi({
    endpoint: `https://${domainName}/${stage}`
  });

  await apiGw.postToConnection({
    ConnectionId: connectionId,
    Data: Buffer.from(JSON.stringify({
      type: "init",
      messages,
      users
    }))
  });

  return { statusCode: 200 };
};