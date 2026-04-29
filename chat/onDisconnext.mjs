import { DynamoDBClient, DeleteItemCommand } from "@aws-sdk/client-dynamodb"

const dynamo = new DynamoDBClient({})

export const handler = async (event) => {
  const connectionId = event.requestContext.connectionId; 

  await dynamo.send(
    new DeleteItemCommand({
      TableName: "ChatConnections",
      Key: {
        connectionId: { S: connectionId }
      }
    })
  );
  
  return { statusCode: 200 };

};
