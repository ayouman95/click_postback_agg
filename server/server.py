import os
import pymysql
from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime, timedelta

# 初始化 Flask 应用
app = Flask(__name__)
# 启用 CORS，允许 React 前端跨域请求
CORS(app)

# 配置 Doris 连接信息 (优先读取环境变量)
DORIS_CONFIG = {
    'host': os.environ.get('DORIS_HOST', '127.0.0.1'),
    'port': int(os.environ.get('DORIS_PORT', 9030)),  # Doris FE 查询端口通常是 9030
    'user': os.environ.get('DORIS_USER', 'root'),
    'password': os.environ.get('DORIS_PASSWORD', ''),
    'database': 'pando',
    'charset': 'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor
}

ALLOWED_DIMENSIONS = {
    'publisher': 'publisher',
    'bundle': 'bundle',
    'brand': 'brand',
    'model': 'model',
    'ad_type': 'ad_type',
    'bid_floor': 'bid_floor',
}

def get_db_connection():
    try:
        conn = pymysql.connect(**DORIS_CONFIG)
        return conn
    except pymysql.MySQLError as e:
        print(f"Error connecting to Doris: {e}")
        return None

def resolve_date_range():
    start = request.args.get('start')
    end = request.args.get('end')
    if start and end:
        return start, end

    days = request.args.get('days', 7, type=int)
    if days <= 0:
        days = 1
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days - 1)
    return start_date.isoformat(), end_date.isoformat()

def build_offer_filter():
    offer_id = request.args.get('offer_id')
    if not offer_id or offer_id == 'ALL':
        return '', []
    return ' AND offer_id = %s', [offer_id]

@app.route('/api/data', methods=['GET'])
def get_analytics_data():
    """
    获取 click_postback_agg 表的数据。
    支持可选参数:
    - days: 获取最近几天的据 (默认 7)
    - limit: 限制返回行数 (默认 5000，防止浏览器崩溃)
    """
    conn = get_db_connection()
    if not conn:
        return jsonify({"code": 500, "message": "Database connection failed"}), 500

    try:
        days = request.args.get('days', 7, type=int)
        limit = request.args.get('limit', 5000, type=int)

        # 构造查询 SQL
        # 注意：前端是做的内存聚合，所以这里我们拉取明细或者预聚合的行
        # 如果数据量巨大，建议在这里做 SUM() GROUP BY 并在前端展示聚合结果
        # 这里为了配合前端现有的逻辑，我们取出基础维度和指标
        sql = f"""
            SELECT
                dt,
                offer_id,
                publisher,
                bundle,
                brand,
                model,
                ad_type,
                bid_floor,
                clicks,
                installs,
                events,
                revenues
            FROM click_postback_agg
            WHERE dt >= date_sub(current_date(), interval %s day)
            LIMIT %s
        """

        with conn.cursor() as cursor:
            print(f"Executing query: {sql} with params: ({days}, {limit})")
            cursor.execute(sql, (days, limit))
            result = cursor.fetchall()

            # 处理日期格式，确保 JSON 可序列化
            for row in result:
                if row.get('dt'):
                    row['dt'] = str(row['dt'])

            return jsonify({
                "code": 200,
                "message": "success",
                "data": result,
                "meta": {
                    "total_rows": len(result),
                    "source": "doris_pando"
                }
            })

    except Exception as e:
        print(f"Query error: {e}")
        return jsonify({"code": 500, "message": str(e)}), 500
    finally:
        conn.close()

@app.route('/api/analytics/<dimension>', methods=['GET'])
def get_dimension_analytics(dimension):
    """
    按维度聚合数据，支持参数：
    - dimension: publisher/bundle/brand/model/ad_type/bid_floor
    - start/end: 日期范围（YYYY-MM-DD）
    - days: 最近N天（默认7）
    - offer_id: 过滤指定Offer
    - limit: 返回行数（默认500）
    """
    dimension_key = ALLOWED_DIMENSIONS.get(dimension)
    if not dimension_key:
        return jsonify({"code": 400, "message": f"Unsupported dimension: {dimension}"}), 400

    conn = get_db_connection()
    if not conn:
        return jsonify({"code": 500, "message": "Database connection failed"}), 500

    try:
        start, end = resolve_date_range()
        limit = request.args.get('limit', 500, type=int)
        offer_filter, offer_params = build_offer_filter()

        summary_sql = f"""
            SELECT
                COALESCE(SUM(clicks), 0) AS clicks,
                COALESCE(SUM(installs), 0) AS installs,
                COALESCE(SUM(events), 0) AS events,
                COALESCE(SUM(revenues), 0) AS revenues
            FROM click_postback_agg
            WHERE dt >= %s AND dt <= %s{offer_filter}
        """

        aggregated_sql = f"""
            SELECT
                {dimension_key} AS dimension_key,
                SUM(clicks) AS clicks,
                SUM(installs) AS installs,
                SUM(events) AS events,
                SUM(revenues) AS revenues
            FROM click_postback_agg
            WHERE dt >= %s AND dt <= %s{offer_filter}
            GROUP BY {dimension_key}
            ORDER BY clicks DESC
            LIMIT %s
        """

        offer_ids_sql = """
            SELECT DISTINCT offer_id
            FROM click_postback_agg
            WHERE dt >= %s AND dt <= %s
            ORDER BY offer_id
        """

        with conn.cursor() as cursor:
            summary_params = [start, end] + offer_params
            cursor.execute(summary_sql, summary_params)
            summary = cursor.fetchone() or {}

            aggregated_params = [start, end] + offer_params + [limit]
            cursor.execute(aggregated_sql, aggregated_params)
            aggregated = cursor.fetchall()

            cursor.execute(offer_ids_sql, [start, end])
            offer_ids = [row['offer_id'] for row in cursor.fetchall()]

            return jsonify({
                "code": 200,
                "message": "success",
                "data": {
                    "dimension": dimension,
                    "date_range": {"start": start, "end": end},
                    "summary": summary,
                    "aggregated": aggregated,
                    "offer_ids": offer_ids
                },
                "meta": {
                    "total_rows": len(aggregated),
                    "source": "doris_pando"
                }
            })

    except Exception as e:
        print(f"Query error: {e}")
        return jsonify({"code": 500, "message": str(e)}), 500
    finally:
        conn.close()

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "service": "doris-analytics-backend"})

if __name__ == '__main__':
    # 启动服务，默认 5000 端口
    print(f"Starting server... Connect to Doris at {DORIS_CONFIG['host']}:{DORIS_CONFIG['port']}")
    app.run(host='0.0.0.0', port=5000, debug=True)
