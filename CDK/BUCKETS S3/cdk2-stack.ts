import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class Cdk2Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
// construct L1 para s2
  //   new cdk.aws_s3.CfnBucket(this, 'MyFirstBucket', {
  //     bucketName: 'my-first-bucket-alechoper-64ds',
  //   });

// contrcut L2 bucket
  const bucket = new cdk.aws_s3.Bucket(this, 'MyFirstBucket', {
    bucketName: 'my-first-bucket-alechoper-64ds2',
  });

  // subir archivo
  new cdk.aws_s3_deployment.BucketDeployment(this, 'DeployFiles', {
    sources: [cdk.aws_s3_deployment.Source.asset('./assets')],
    destinationBucket: bucket
  });

  }
}
