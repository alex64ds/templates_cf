import json
import boto3

def lambda_handler(event, context):
    regiones = ['us-east-1', 'us-west-2']
    resultado = {}

    for region in regiones:
        ec2 = boto3.client('ec2', region_name=region)
        response = ec2.describe_instances(
            Filters=[{'Name': 'instance-state-name', 'Values': ['running']}]
        )

        instancias = [inst for reserva in response['Reservations'] for inst in reserva['Instances']]
        total_activas = len(instancias)

        # Contar instancias con etiqueta entorno=pruebas
        pruebas = 0
        for inst in instancias:
            tags = {tag['Key']: tag['Value'] for tag in inst.get('Tags', [])}
            if tags.get('entorno') == 'pruebas':
                pruebas += 1

        if total_activas == 0:
            resultado[region] = "No hay instancias activas"
        else:
            resultado[region] = {
                "total_activas": total_activas,
                "entorno_pruebas": pruebas
            }

    return {
        'statusCode': 200,
        'body': json.dumps(resultado)
    }
