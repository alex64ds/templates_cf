import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';

export class Cdk2Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─── 1. Lambda función inline (responde al GET /hello) ───────────────────
    const helloFn = new lambda.CfnFunction(this, 'HelloFunction', {
      functionName: 'hello-handler',
      runtime: 'nodejs20.x',
      handler: 'index.handler',
      role: new iam.CfnRole(this, 'LambdaRole', {
        assumeRolePolicyDocument: {
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Principal: { Service: 'lambda.amazonaws.com' },
            Action: 'sts:AssumeRole',
          }],
        },
        managedPolicyArns: [
          'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
        ],
      }).attrArn,
      code: {
        zipFile: `
exports.handler = async () => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hello from CDK L1!' }),
});`,
      },
    });

    // ─── 2. REST API ──────────────────────────────────────────────────────────
    const restApi = new apigateway.CfnRestApi(this, 'HelloRestApi', {
      name: 'HelloApi',
      description: 'API REST desplegada con constructores L1',
    });

    // ─── 3. Recurso /hello ────────────────────────────────────────────────────
    const helloResource = new apigateway.CfnResource(this, 'HelloResource', {
      restApiId: restApi.ref,
      parentId: restApi.attrRootResourceId,
      pathPart: 'hello',
    });

    // ─── 4. Método GET ────────────────────────────────────────────────────────
    const getMethod = new apigateway.CfnMethod(this, 'HelloGetMethod', {
      restApiId: restApi.ref,
      resourceId: helloResource.ref,
      httpMethod: 'GET',
      authorizationType: 'NONE',
      integration: {
        type: 'AWS_PROXY',
        integrationHttpMethod: 'POST',          // Lambda siempre recibe POST
        uri: cdk.Fn.join('', [
          'arn:aws:apigateway:',
          this.region,
          ':lambda:path/2015-03-31/functions/',
          helloFn.attrArn,
          '/invocations',
        ]),
      },
    });

    // ─── 5. Permiso para que API Gateway invoque Lambda ───────────────────────
    new lambda.CfnPermission(this, 'ApiGwPermission', {
      action: 'lambda:InvokeFunction',
      functionName: helloFn.attrArn,
      principal: 'apigateway.amazonaws.com',
      sourceArn: cdk.Fn.join('', [
        'arn:aws:execute-api:',
        this.region,
        ':',
        this.account,
        ':',
        restApi.ref,
        '/*/GET/hello',
      ]),
    });

    // ─── 6. Deployment (depende del método para que CF lo ordene bien) ────────
    const deployment = new apigateway.CfnDeployment(this, 'HelloDeployment', {
      restApiId: restApi.ref,
    });
    deployment.addDependency(getMethod);   // garantiza orden de creación

    // ─── 7. Stage "produc" ────────────────────────────────────────────────────
    const stage = new apigateway.CfnStage(this, 'ProducStage', {
      restApiId: restApi.ref,
      deploymentId: deployment.ref,
      stageName: 'produc',
    });

    // ─── 8. Output con el endpoint público de /hello ──────────────────────────
    new cdk.CfnOutput(this, 'HelloEndpoint', {
      description: 'Endpoint público — prueba con: curl <URL>',
      value: cdk.Fn.join('', [
        'https://',
        restApi.ref,
        '.execute-api.',
        this.region,
        '.amazonaws.com/',
        'produc',
        '/hello',
      ]),
    });
  }
}