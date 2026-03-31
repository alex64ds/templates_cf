import json
import boto3
import datetime
from botocore.exceptions import ClientError

sns_client = boto3.client("sns")
dynamodb = boto3.resource("dynamodb")
table_name = 'Mensajes'

def create_table_if_not_exists():
    try:
        table = dynamodb.Table(table_name)
        table.load()
        return table

    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceNotFoundException':
            table = dynamodb.create_table(
                TableName=table_name,
                KeySchema=[
                    {'AttributeName': 'id', 'KeyType': 'HASH'}
                ],
                AttributeDefinitions=[
                    {'AttributeName': 'id', 'AttributeType': 'S'}
                ],
                BillingMode='PAY_PER_REQUEST'
            )
            table.wait_until_exists()
            return table
        else:
            raise

# 🔹 NUEVA FUNCIÓN: obtener historial
def get_message_history(table, limit=5):
    response = table.scan()
    items = response.get('Items', [])

    # Ordenar por fecha (id es timestamp)
    items_sorted = sorted(items, key=lambda x: x['id'], reverse=True)

    # Limitar resultados
    history = items_sorted[:limit]

    # 🔹 FORMATO NUEVO: incluir id + mensaje
    history_text = "\n".join([
        f"- [{item['id']}] {item['mensaje']}"
        for item in history
    ])

    return history_text

def lambda_handler(event, context):
    try:
        fecha = str(datetime.datetime.utcnow())

        print("Evento recibido:", json.dumps(event))

        body = {}
        if "body" in event:
            try:
                body = json.loads(event["body"])
            except json.JSONDecodeError:
                body = {}

        message = body.get("message", "Mensaje por defecto")
        subject = body.get("subject", "Notificacion API")

        # Asegurar tabla
        table = create_table_if_not_exists()

        # 🔹 Obtener historial antes de guardar el nuevo mensaje
        history = get_message_history(table)

        # 🔹 Construir mensaje completo
        full_message = f"""
Mensaje actual:
{message}

Historial de mensajes:
{history if history else "Sin mensajes previos"}
"""

        # Publicar en SNS
        response = sns_client.publish(
            TopicArn="arn:aws:sns:us-east-1:831221583932:MiNotificacionTopic",
            Message=full_message,
            Subject=subject
        )

        # Guardar mensaje actual
        table.put_item(
            Item={
                'id': fecha,
                'mensaje': message
            }
        )

        return {
            "statusCode": 200,
            "body": json.dumps({
                "message_enviado": message,
                "historial": history,
                "SNS_RESPONSE": response
            })
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({
                "error": str(e)
            })
        }