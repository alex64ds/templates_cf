import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cfn from 'aws-cdk-lib/core';

export class CdkDynamoStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── 1. Tabla DynamoDB (L1) ───────────────────────────────────────────────
    const tabla = new dynamodb.CfnTable(this, 'reservasTable', {
      tableName: 'reservas',
      billingMode: 'PAY_PER_REQUEST',
      attributeDefinitions: [
        {
          attributeName: 'reserva_id',   // Partition Key
          attributeType: 'S',
        },
      ],
      keySchema: [
        {
          attributeName: 'reserva_id',
          keyType: 'HASH',
        },
      ],
    });

    // ─── 2. IAM Role para la Lambda seed ─────────────────────────────────────
    const seedRole = new iam.CfnRole(this, 'SeedRole', {
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: 'lambda.amazonaws.com' },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      managedPolicyArns: [
        'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
      ],
      policies: [
        {
          policyName: 'DynamoPutItem',
          policyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: ['dynamodb:PutItem'],
                Resource: tabla.attrArn,
              },
            ],
          },
        },
      ],
    });

    // ─── 3. Lambda seed con protocolo CFN Custom Resource ────────────────
    const seedFn = new lambda.CfnFunction(this, 'SeedFunction', {
      functionName: 'reservas-seed',
      runtime: 'nodejs20.x',
      handler: 'index.handler',
      role: seedRole.attrArn,
      timeout: 30,
      code: {
        zipFile: `
const https  = require('https');
const url    = require('url');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({});

const items = [
  {
    reserva_id:     { S: 'RES-001' },
    fecha_inicio:   { S: '2025-06-01' },
    fecha_fin:      { S: '2025-06-07' },
    nombre_cliente: { S: 'Ana Garcia' },
  },
  {
    reserva_id:     { S: 'RES-002' },
    fecha_inicio:   { S: '2025-07-15' },
    fecha_fin:      { S: '2025-07-20' },
    nombre_cliente: { S: 'Carlos Lopez' },
  },
];

function sendResponse(event, status, reason) {
  const body = JSON.stringify({
    Status:             status,
    Reason:             reason || 'OK',
    PhysicalResourceId: 'reservas-seed',
    StackId:            event.StackId,
    RequestId:          event.RequestId,
    LogicalResourceId:  event.LogicalResourceId,
    Data:               {},
  });

  const parsed = url.parse(event.ResponseURL);
  const options = {
    hostname: parsed.hostname,
    port:     443,
    path:     parsed.path,
    method:   'PUT',
    headers:  { 'Content-Type': '', 'Content-Length': Buffer.byteLength(body) },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, resolve);
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event));
  try {
    if (event.RequestType !== 'Delete') {
      for (const item of items) {
        await client.send(new PutItemCommand({
          TableName: process.env.TABLE_NAME,
          Item: item,
        }));
      }
    }
    await sendResponse(event, 'SUCCESS', 'Items insertados');
  } catch (err) {
    console.error(err);
    await sendResponse(event, 'FAILED', String(err));
  }
};`,
      },
      environment: {
        variables: { TABLE_NAME: 'reservas' },
      },
    });

    seedFn.addDependency(tabla);
    seedFn.addDependency(seedRole);

    // ─── 4. Permiso: CloudFormation puede invocar la Lambda ─────────────
    const seedPermission = new lambda.CfnPermission(this, 'SeedPermission', {
      action: 'lambda:InvokeFunction',
      functionName: seedFn.attrArn,
      principal: 'cloudformation.amazonaws.com',
    });
    seedPermission.addDependency(seedFn);

    // ─── 5. CfnCustomResource ─────────────────────────────────────────────
    const customResource = new cfn.CfnCustomResource(this, 'SeedCustomResource', {
      serviceToken: seedFn.attrArn,
    });
    customResource.addDependency(seedFn);
    customResource.addDependency(seedPermission);

    // ─── 6. Lambda Insert para API Gateway ────────────────────────────────
    const insertRole = new iam.CfnRole(this, 'InsertRole', {
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { Service: 'lambda.amazonaws.com' },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      managedPolicyArns: [
        'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
      ],
      policies: [
        {
          policyName: 'DynamoPutItem',
          policyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: ['dynamodb:PutItem'],
                Resource: tabla.attrArn,
              },
            ],
          },
        },
      ],
    });

    const insertFn = new lambda.CfnFunction(this, 'InsertFunction', {
      functionName: 'reservas-insert',
      runtime: 'nodejs20.x',
      handler: 'index.handler',
      role: insertRole.attrArn,
      timeout: 30,
      code: {
        zipFile: `
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const client = new DynamoDBClient({});

exports.handler = async (event) => {
  const body = JSON.parse(event.body);
  const item = {
    reserva_id: { S: body.reserva_id },
    fecha_inicio: { S: body.fecha_inicio },
    fecha_fin: { S: body.fecha_fin },
    nombre_cliente: { S: body.nombre_cliente },
  };
  try {
    await client.send(new PutItemCommand({ TableName: process.env.TABLE_NAME, Item: item }));
    return { statusCode: 200, body: JSON.stringify({ message: "Reserva insertada" }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
`,
      },
      environment: { variables: { TABLE_NAME: 'reservas' } },
    });
    insertFn.addDependency(tabla);
    insertFn.addDependency(insertRole);



    // ─── 8. API Gateway L1 ───────────────────────────────────────────────
    const api = new apigateway.CfnRestApi(this, 'ReservasApi', {
      name: 'ReservasAPI',
    });

    const reservasResource = new apigateway.CfnResource(this, 'ReservasResource', {
      parentId: api.attrRootResourceId,
      pathPart: 'reservas',
      restApiId: api.ref,
    });

    const postMethod = new apigateway.CfnMethod(this, 'PostReservasMethod', {
      restApiId: api.ref,
      resourceId: reservasResource.ref,
      httpMethod: 'POST',
      authorizationType: 'NONE',
      integration: {
        type: 'AWS_PROXY',
        integrationHttpMethod: 'POST',
        uri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${insertFn.attrArn}/invocations`,
      },
    });

    const deployment = new apigateway.CfnDeployment(this, 'ApiDeployment', {
      restApiId: api.ref,
    });
    deployment.addDependency(postMethod);

    const stage = new apigateway.CfnStage(this, 'ApiStage', {
      restApiId: api.ref,
      deploymentId: deployment.ref,
      stageName: 'prod',
    });

        // ─── 7. Permiso Lambda para API Gateway ───────────────────────────────
    const apiPermission = new lambda.CfnPermission(this, 'ApiPermission', {
      action: 'lambda:InvokeFunction',
      functionName: insertFn.attrArn,
      principal: 'apigateway.amazonaws.com',
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${api.ref}/*/POST/reservas`,
    });
    postMethod.addDependency(apiPermission);

    // ─── 9. Outputs ─────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'TablaArn', {
      description: 'ARN de la tabla DynamoDB reservas',
      value: tabla.attrArn,
    });

    new cdk.CfnOutput(this, 'TablaName', {
      description: 'Escanea con: aws dynamodb scan --table-name reservas',
      value: 'reservas',
    });

    new cdk.CfnOutput(this, 'ApiEndpoint', {
      description: 'URL para insertar reservas',
      value: `https://${api.ref}.execute-api.${this.region}.amazonaws.com/prod/reservas`,
    });
  }
}