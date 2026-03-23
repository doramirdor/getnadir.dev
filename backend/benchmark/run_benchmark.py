#!/usr/bin/env python3
"""
Nadir Benchmark Runner — 6-way comparison with LLM judge.

Runs 40 diverse prompts (30 single-turn + 10 multi-turn) across 6 configurations:
  V1: Baseline (Opus only)
  V2: Router only
  V3: Safe optimize only
  V4: Router + Safe optimize
  V5: Aggressive optimize only
  V6: Router + Aggressive optimize

Context optimization modes:
  safe       — normalize whitespace, collapse empty lines, strip markdown formatting noise
  aggressive — all safe transforms PLUS truncate multi-turn conversation history to
               system + last 2 user messages + last assistant message

Multi-turn prompts (31-40) have 5+ turns of conversation history and are where
aggressive context optimization delivers meaningful token savings.

Results saved to JSON with timestamp for daily tracking.

Usage:
  python benchmark/run_benchmark.py
  python benchmark/run_benchmark.py --prompts 30  # skip multi-turn
  python benchmark/run_benchmark.py --output results/  # custom output dir
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Add parent to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# ── 30 Diverse Prompts ────────────────────────────────────────────────

PROMPTS = [
    # Simple (10) — should route to cheapest
    {"id": 1,  "cat": "simple", "prompt": "What is the capital of France?"},
    {"id": 2,  "cat": "simple", "prompt": "What is 17 * 23?"},
    {"id": 3,  "cat": "simple", "prompt": "Translate 'good morning' to Japanese."},
    {"id": 4,  "cat": "simple", "prompt": "What year did the Berlin Wall fall?"},
    {"id": 5,  "cat": "simple", "prompt": "Define the word 'ephemeral'."},
    {"id": 6,  "cat": "simple", "prompt": "Is Python interpreted or compiled?"},
    {"id": 7,  "cat": "simple", "prompt": "What's the hex color code for red?"},
    {"id": 8,  "cat": "simple", "prompt": "How many continents are there?"},
    {"id": 9,  "cat": "simple", "prompt": "What does HTTP stand for?"},
    {"id": 10, "cat": "simple", "prompt": "Convert 100°F to Celsius."},

    # Medium (10) — should route to mid-tier
    {"id": 11, "cat": "medium", "prompt": "Explain the difference between TCP and UDP in 3 sentences."},
    {"id": 12, "cat": "medium", "prompt": "Write a Python function that checks if a string is a palindrome."},
    {"id": 13, "cat": "medium", "prompt": "Pros and cons of microservices vs monolith architecture?"},
    {"id": 14, "cat": "medium", "prompt": "Summarize the CAP theorem and its implications."},
    {"id": 15, "cat": "medium", "prompt": "Write a SQL query to find the second highest salary in an employees table."},
    {"id": 16, "cat": "medium", "prompt": "Explain how a hash table works, including collision handling."},
    {"id": 17, "cat": "medium", "prompt": "Write a bash one-liner to find the 10 largest files in a directory."},
    {"id": 18, "cat": "medium", "prompt": "Explain the Observer pattern with a real-world example."},
    {"id": 19, "cat": "medium", "prompt": "What are the SOLID principles? Give a brief example of each."},
    {"id": 20, "cat": "medium", "prompt": "Describe how DNS resolution works step by step."},

    # Complex (10) — should route to premium
    {"id": 21, "cat": "complex", "prompt": "Design a distributed rate limiter for 1M requests/second. Include the algorithm, data structures, Redis schema, failure modes, and Python implementation."},
    {"id": 22, "cat": "complex", "prompt": "Implement a thread-safe LRU cache in Python with O(1) get and put operations, TTL support, and automatic eviction. Include comprehensive type hints and unit tests."},
    {"id": 23, "cat": "complex", "prompt": "Analyze the trade-offs between event sourcing and traditional CRUD for a financial trading platform. Cover consistency guarantees, auditability, replay capability, and performance implications."},
    {"id": 24, "cat": "complex", "prompt": "Write a recursive descent parser for arithmetic expressions supporting +, -, *, /, parentheses, and variables. Include an AST representation and an evaluator."},
    {"id": 25, "cat": "complex", "prompt": "Design a real-time collaborative text editor. Compare CRDTs vs OT approaches, address conflict resolution, presence indicators, and offline support."},
    {"id": 26, "cat": "complex", "prompt": "Implement a B+ tree in Python with insert, delete, search, and range query operations. Handle node splitting, merging, and redistribution."},
    {"id": 27, "cat": "complex", "prompt": "Compare consensus algorithms: Raft, Paxos, PBFT, and Tendermint. Evaluate each on latency, throughput, fault tolerance, and suitability for blockchain vs traditional distributed systems."},
    {"id": 28, "cat": "complex", "prompt": "Design a machine learning pipeline for real-time fraud detection. Cover feature engineering, model selection, training/serving split, latency requirements, and handling concept drift."},
    {"id": 29, "cat": "complex", "prompt": "Implement a custom memory allocator in Python that supports malloc, free, realloc with coalescing. Include fragmentation tracking and a visualization of the heap state."},
    {"id": 30, "cat": "complex", "prompt": "Design a multi-region database replication strategy. Address consistency models, conflict resolution, failover, latency optimization, and compliance with data residency requirements."},

    # Multi-turn conversations (10) — context optimization shows real value here
    {"id": 31, "cat": "multi-turn", "messages": [
        {"role": "system", "content": "You are a helpful coding assistant specializing in Python."},
        {"role": "user", "content": "How do I parse JSON in Python?"},
        {"role": "assistant", "content": "You can use Python's built-in `json` module. Here's how:\n\n```python\nimport json\n\n# Parse a JSON string\ndata = json.loads('{\"name\": \"Alice\", \"age\": 30}')\nprint(data['name'])  # Alice\n\n# Parse from a file\nwith open('data.json') as f:\n    data = json.load(f)\n```\n\nThe key functions are `json.loads()` for strings and `json.load()` for file objects."},
        {"role": "user", "content": "What about handling errors when the JSON is malformed?"},
        {"role": "assistant", "content": "Use try/except with `json.JSONDecodeError`:\n\n```python\nimport json\n\ntry:\n    data = json.loads(invalid_json_string)\nexcept json.JSONDecodeError as e:\n    print(f'Invalid JSON at line {e.lineno}, col {e.colno}: {e.msg}')\n```\n\nYou can also catch `ValueError` which is the parent class, but `JSONDecodeError` gives you more specific error info including line number and column."},
        {"role": "user", "content": "Can you show me how to validate JSON against a schema?"},
        {"role": "assistant", "content": "Use the `jsonschema` library:\n\n```python\nfrom jsonschema import validate, ValidationError\n\nschema = {\n    'type': 'object',\n    'properties': {\n        'name': {'type': 'string'},\n        'age': {'type': 'integer', 'minimum': 0}\n    },\n    'required': ['name', 'age']\n}\n\ntry:\n    validate(instance={'name': 'Alice', 'age': 30}, schema=schema)\nexcept ValidationError as e:\n    print(f'Validation failed: {e.message}')\n```\n\nInstall with `pip install jsonschema`."},
        {"role": "user", "content": "Now write a complete JSON parser class with validation, error handling, custom deserializers, and support for JSON5 comments."},
    ]},
    {"id": 32, "cat": "multi-turn", "messages": [
        {"role": "system", "content": "You are a senior DevOps engineer helping with Kubernetes deployments."},
        {"role": "user", "content": "How do I create a basic deployment in Kubernetes?"},
        {"role": "assistant", "content": "Create a deployment YAML like this:\n\n```yaml\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: my-app\nspec:\n  replicas: 3\n  selector:\n    matchLabels:\n      app: my-app\n  template:\n    metadata:\n      labels:\n        app: my-app\n    spec:\n      containers:\n      - name: my-app\n        image: my-app:latest\n        ports:\n        - containerPort: 8080\n```\n\nApply with `kubectl apply -f deployment.yaml`."},
        {"role": "user", "content": "How do I add health checks?"},
        {"role": "assistant", "content": "Add liveness and readiness probes to your container spec:\n\n```yaml\nlivenessProbe:\n  httpGet:\n    path: /health\n    port: 8080\n  initialDelaySeconds: 30\n  periodSeconds: 10\nreadinessProbe:\n  httpGet:\n    path: /ready\n    port: 8080\n  initialDelaySeconds: 5\n  periodSeconds: 5\n```\n\nLiveness restarts unhealthy pods. Readiness controls traffic routing."},
        {"role": "user", "content": "What about resource limits?"},
        {"role": "assistant", "content": "Add resources block:\n\n```yaml\nresources:\n  requests:\n    memory: '128Mi'\n    cpu: '250m'\n  limits:\n    memory: '256Mi'\n    cpu: '500m'\n```\n\nRequests are what the scheduler guarantees. Limits are the max. Set them based on actual usage metrics."},
        {"role": "user", "content": "How do I set up horizontal pod autoscaling?"},
        {"role": "assistant", "content": "Create an HPA:\n\n```yaml\napiVersion: autoscaling/v2\nkind: HorizontalPodAutoscaler\nmetadata:\n  name: my-app-hpa\nspec:\n  scaleTargetRef:\n    apiVersion: apps/v1\n    kind: Deployment\n    name: my-app\n  minReplicas: 2\n  maxReplicas: 10\n  metrics:\n  - type: Resource\n    resource:\n      name: cpu\n      target:\n        type: Utilization\n        averageUtilization: 70\n```\n\nRequires metrics-server installed in the cluster."},
        {"role": "user", "content": "Now design a complete production-ready Kubernetes deployment with blue-green deployments, canary releases, auto-scaling, pod disruption budgets, and network policies."},
    ]},
    {"id": 33, "cat": "multi-turn", "messages": [
        {"role": "system", "content": "You are a database expert helping with PostgreSQL optimization."},
        {"role": "user", "content": "My query is slow. How do I analyze it?"},
        {"role": "assistant", "content": "Use EXPLAIN ANALYZE:\n\n```sql\nEXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)\nSELECT * FROM orders WHERE customer_id = 123;\n```\n\nLook for sequential scans on large tables, high actual row counts vs estimates, and sort operations spilling to disk."},
        {"role": "user", "content": "It shows a sequential scan. How do I add an index?"},
        {"role": "assistant", "content": "Create an index on the filtered column:\n\n```sql\nCREATE INDEX CONCURRENTLY idx_orders_customer_id ON orders(customer_id);\n```\n\nUse CONCURRENTLY to avoid locking the table during creation. For composite queries, create multi-column indexes matching your WHERE clause order."},
        {"role": "user", "content": "What about partial indexes?"},
        {"role": "assistant", "content": "Partial indexes only index rows matching a condition, saving space and improving write performance:\n\n```sql\nCREATE INDEX idx_orders_active ON orders(customer_id)\nWHERE status = 'active';\n```\n\nGreat for queries that always filter on a specific condition."},
        {"role": "user", "content": "My joins are still slow even with indexes."},
        {"role": "assistant", "content": "Check these common issues:\n\n1. Ensure join columns have matching types (implicit casts prevent index use)\n2. Increase `work_mem` for complex joins: `SET work_mem = '256MB';`\n3. Consider materialized views for complex aggregations\n4. Use `pg_stat_user_tables` to check if tables need VACUUM/ANALYZE\n\n```sql\nSELECT relname, n_live_tup, n_dead_tup, last_analyze\nFROM pg_stat_user_tables WHERE schemaname = 'public';\n```"},
        {"role": "user", "content": "Design a complete PostgreSQL optimization strategy for a high-traffic e-commerce database with 100M+ rows, covering indexing, partitioning, connection pooling, query optimization, and monitoring."},
    ]},
    {"id": 34, "cat": "multi-turn", "messages": [
        {"role": "system", "content": "You are a security engineer specializing in web application security."},
        {"role": "user", "content": "What are the OWASP Top 10?"},
        {"role": "assistant", "content": "The OWASP Top 10 (2021) are:\n1. Broken Access Control\n2. Cryptographic Failures\n3. Injection\n4. Insecure Design\n5. Security Misconfiguration\n6. Vulnerable Components\n7. Auth Failures\n8. Data Integrity Failures\n9. Logging Failures\n10. SSRF"},
        {"role": "user", "content": "How do I prevent SQL injection in Python?"},
        {"role": "assistant", "content": "Always use parameterized queries:\n\n```python\n# SAFE - parameterized\ncursor.execute('SELECT * FROM users WHERE id = %s', (user_id,))\n\n# UNSAFE - string formatting\ncursor.execute(f'SELECT * FROM users WHERE id = {user_id}')  # NEVER DO THIS\n```\n\nWith SQLAlchemy, use bound parameters or the ORM which handles it automatically."},
        {"role": "user", "content": "What about XSS prevention?"},
        {"role": "assistant", "content": "Key XSS defenses:\n1. Output encoding - escape HTML entities\n2. Content Security Policy headers\n3. HttpOnly cookies\n4. Input validation\n\n```python\nfrom markupsafe import escape\nsafe_output = escape(user_input)\n```\n\nModern frameworks like React auto-escape by default."},
        {"role": "user", "content": "How do I implement CSRF protection?"},
        {"role": "assistant", "content": "Use CSRF tokens:\n\n```python\n# Flask example\nfrom flask_wtf.csrf import CSRFProtect\ncsrf = CSRFProtect(app)\n\n# In templates\n<form>\n    {{ csrf_token() }}\n    ...\n</form>\n```\n\nAlso set `SameSite=Strict` on cookies and verify the `Origin` header on state-changing requests."},
        {"role": "user", "content": "Now design a comprehensive security audit checklist and automated testing pipeline for a financial services web application, covering authentication, authorization, encryption, API security, and compliance with SOC2 and PCI-DSS."},
    ]},
    {"id": 35, "cat": "multi-turn", "messages": [
        {"role": "system", "content": "You are an expert React developer helping build a dashboard application."},
        {"role": "user", "content": "How do I set up React Router for my dashboard?"},
        {"role": "assistant", "content": "Install and configure React Router:\n\n```tsx\nimport { BrowserRouter, Routes, Route } from 'react-router-dom';\n\nfunction App() {\n  return (\n    <BrowserRouter>\n      <Routes>\n        <Route path='/' element={<Dashboard />} />\n        <Route path='/users' element={<Users />} />\n        <Route path='/settings' element={<Settings />} />\n      </Routes>\n    </BrowserRouter>\n  );\n}\n```"},
        {"role": "user", "content": "How do I add protected routes with authentication?"},
        {"role": "assistant", "content": "Create a ProtectedRoute wrapper:\n\n```tsx\nfunction ProtectedRoute({ children }: { children: React.ReactNode }) {\n  const { user } = useAuth();\n  if (!user) return <Navigate to='/login' />;\n  return <>{children}</>;\n}\n\n// Usage\n<Route path='/dashboard' element={\n  <ProtectedRoute><Dashboard /></ProtectedRoute>\n} />\n```"},
        {"role": "user", "content": "What about data fetching with React Query?"},
        {"role": "assistant", "content": "Use TanStack React Query:\n\n```tsx\nfunction Users() {\n  const { data, isLoading } = useQuery({\n    queryKey: ['users'],\n    queryFn: () => fetch('/api/users').then(r => r.json()),\n  });\n\n  if (isLoading) return <Spinner />;\n  return <UserTable data={data} />;\n}\n```\n\nWrap your app in `QueryClientProvider`."},
        {"role": "user", "content": "How do I add real-time updates?"},
        {"role": "assistant", "content": "Combine React Query with WebSockets:\n\n```tsx\nuseEffect(() => {\n  const ws = new WebSocket('ws://api/live');\n  ws.onmessage = (event) => {\n    queryClient.invalidateQueries({ queryKey: ['users'] });\n  };\n  return () => ws.close();\n}, []);\n```\n\nOr use React Query's `refetchInterval` for polling."},
        {"role": "user", "content": "Now build a complete real-time analytics dashboard with charts, filterable data tables, role-based access control, dark mode, responsive layout, and WebSocket-driven live updates. Include the full component architecture."},
    ]},
    {"id": 36, "cat": "multi-turn", "messages": [
        {"role": "system", "content": "You are a machine learning engineer helping with model deployment."},
        {"role": "user", "content": "How do I save a trained PyTorch model?"},
        {"role": "assistant", "content": "Save the state dict (recommended):\n\n```python\ntorch.save(model.state_dict(), 'model.pth')\n\n# Load\nmodel = MyModel()\nmodel.load_state_dict(torch.load('model.pth'))\nmodel.eval()\n```"},
        {"role": "user", "content": "How do I convert it to ONNX for production?"},
        {"role": "assistant", "content": "Export to ONNX:\n\n```python\nimport torch.onnx\n\ndummy_input = torch.randn(1, 3, 224, 224)\ntorch.onnx.export(model, dummy_input, 'model.onnx',\n                  input_names=['input'],\n                  output_names=['output'],\n                  dynamic_axes={'input': {0: 'batch_size'}})\n```\n\nThen use ONNX Runtime for inference which is often 2-3x faster."},
        {"role": "user", "content": "What about model versioning?"},
        {"role": "assistant", "content": "Use MLflow for model registry:\n\n```python\nimport mlflow\n\nwith mlflow.start_run():\n    mlflow.log_params({'lr': 0.001, 'epochs': 50})\n    mlflow.log_metrics({'accuracy': 0.95})\n    mlflow.pytorch.log_model(model, 'model',\n                             registered_model_name='my-classifier')\n```\n\nMLflow tracks versions, stages (staging/production), and lineage."},
        {"role": "user", "content": "How do I handle A/B testing between model versions?"},
        {"role": "assistant", "content": "Use a traffic splitting approach:\n\n```python\nimport random\n\ndef predict(input_data):\n    if random.random() < 0.1:  # 10% to new model\n        result = model_v2.predict(input_data)\n        log_prediction('v2', input_data, result)\n    else:\n        result = model_v1.predict(input_data)\n        log_prediction('v1', input_data, result)\n    return result\n```\n\nBetter: use a feature flag service like LaunchDarkly or a service mesh like Istio for traffic splitting."},
        {"role": "user", "content": "Design a complete ML model serving infrastructure with auto-scaling, A/B testing, model versioning, canary deployments, monitoring for data drift, and rollback capabilities. Include architecture diagram description and implementation details."},
    ]},
    {"id": 37, "cat": "multi-turn", "messages": [
        {"role": "system", "content": "You are an API design expert helping build a RESTful API."},
        {"role": "user", "content": "What are the best practices for REST API design?"},
        {"role": "assistant", "content": "Key REST API best practices:\n1. Use nouns for resources: `/users`, `/orders`\n2. HTTP methods for actions: GET, POST, PUT, PATCH, DELETE\n3. Plural resource names: `/users/123` not `/user/123`\n4. Nest related resources: `/users/123/orders`\n5. Use query params for filtering: `/users?role=admin`\n6. Return proper HTTP status codes\n7. Version your API: `/v1/users`"},
        {"role": "user", "content": "How should I handle pagination?"},
        {"role": "assistant", "content": "Use cursor-based pagination for large datasets:\n\n```json\nGET /api/v1/users?limit=20&cursor=eyJpZCI6MTAwfQ\n\nResponse:\n{\n  \"data\": [...],\n  \"pagination\": {\n    \"next_cursor\": \"eyJpZCI6MTIwfQ\",\n    \"has_more\": true\n  }\n}\n```\n\nCursor pagination is more efficient than offset-based for large tables and handles real-time data changes correctly."},
        {"role": "user", "content": "What about error handling?"},
        {"role": "assistant", "content": "Use a consistent error format:\n\n```json\n{\n  \"error\": {\n    \"code\": \"VALIDATION_ERROR\",\n    \"message\": \"Invalid email format\",\n    \"details\": [\n      {\"field\": \"email\", \"message\": \"Must be a valid email address\"}\n    ],\n    \"request_id\": \"req_abc123\"\n  }\n}\n```\n\nMap to proper HTTP codes: 400 validation, 401 auth, 403 forbidden, 404 not found, 429 rate limit, 500 server error."},
        {"role": "user", "content": "How do I implement rate limiting?"},
        {"role": "assistant", "content": "Use token bucket or sliding window:\n\n```python\nfrom fastapi import Request\nfrom slowapi import Limiter\n\nlimiter = Limiter(key_func=get_remote_address)\n\n@app.get('/api/users')\n@limiter.limit('100/minute')\nasync def get_users(request: Request):\n    ...\n```\n\nReturn `429 Too Many Requests` with `Retry-After` header. Use Redis for distributed rate limiting across multiple instances."},
        {"role": "user", "content": "Design a complete API gateway with authentication, rate limiting, request validation, response caching, circuit breaking, API versioning, OpenAPI documentation, and webhook support. Include the FastAPI implementation."},
    ]},
    {"id": 38, "cat": "multi-turn", "messages": [
        {"role": "system", "content": "You are a testing expert helping write comprehensive tests."},
        {"role": "user", "content": "How do I structure tests in pytest?"},
        {"role": "assistant", "content": "Follow this structure:\n\n```\ntests/\n  conftest.py          # shared fixtures\n  unit/\n    test_models.py\n    test_services.py\n  integration/\n    test_api.py\n    test_database.py\n```\n\nUse fixtures for setup, parametrize for multiple cases, and markers for categorization."},
        {"role": "user", "content": "How do I mock external API calls?"},
        {"role": "assistant", "content": "Use `unittest.mock` or `responses`:\n\n```python\nfrom unittest.mock import patch, MagicMock\n\n@patch('myapp.services.requests.get')\ndef test_fetch_user(mock_get):\n    mock_get.return_value.json.return_value = {'name': 'Alice'}\n    mock_get.return_value.status_code = 200\n    \n    result = fetch_user(123)\n    assert result['name'] == 'Alice'\n    mock_get.assert_called_once()\n```"},
        {"role": "user", "content": "What about testing async code?"},
        {"role": "assistant", "content": "Use `pytest-asyncio`:\n\n```python\nimport pytest\n\n@pytest.mark.asyncio\nasync def test_async_endpoint(async_client):\n    response = await async_client.get('/api/users')\n    assert response.status_code == 200\n\n@pytest.fixture\nasync def async_client():\n    async with AsyncClient(app=app, base_url='http://test') as client:\n        yield client\n```"},
        {"role": "user", "content": "How do I test database interactions?"},
        {"role": "assistant", "content": "Use a test database with transactions:\n\n```python\n@pytest.fixture\nasync def db_session():\n    async with engine.begin() as conn:\n        await conn.run_sync(Base.metadata.create_all)\n    async with AsyncSession(engine) as session:\n        yield session\n        await session.rollback()\n    async with engine.begin() as conn:\n        await conn.run_sync(Base.metadata.drop_all)\n```\n\nUse testcontainers for PostgreSQL to match production."},
        {"role": "user", "content": "Now create a complete testing strategy and implementation for a FastAPI microservice with 90%+ coverage, including unit tests, integration tests, contract tests, load tests, and a CI/CD pipeline configuration."},
    ]},
    {"id": 39, "cat": "multi-turn", "messages": [
        {"role": "system", "content": "You are an infrastructure engineer helping with CI/CD pipeline design."},
        {"role": "user", "content": "What CI/CD tool should I use for a Python project?"},
        {"role": "assistant", "content": "GitHub Actions is a great choice for most projects:\n- Free for public repos, generous free tier for private\n- Native GitHub integration\n- Huge marketplace of actions\n- Matrix builds for multiple Python versions\n\nAlternatives: GitLab CI (good if self-hosting), CircleCI (fast), Jenkins (maximum flexibility but high maintenance)."},
        {"role": "user", "content": "Show me a basic GitHub Actions workflow."},
        {"role": "assistant", "content": "```yaml\nname: CI\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    strategy:\n      matrix:\n        python-version: ['3.10', '3.11', '3.12']\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-python@v5\n        with:\n          python-version: ${{ matrix.python-version }}\n      - run: pip install -r requirements.txt\n      - run: pytest tests/ --cov=app\n```"},
        {"role": "user", "content": "How do I add deployment stages?"},
        {"role": "assistant", "content": "Add environment-based deployment jobs:\n\n```yaml\ndeploy-staging:\n  needs: test\n  if: github.ref == 'refs/heads/develop'\n  environment: staging\n  steps:\n    - run: ./deploy.sh staging\n\ndeploy-production:\n  needs: test\n  if: github.ref == 'refs/heads/main'\n  environment: production\n  steps:\n    - run: ./deploy.sh production\n```\n\nUse GitHub Environments for approval gates and secrets scoping."},
        {"role": "user", "content": "What about secrets management?"},
        {"role": "assistant", "content": "Use GitHub encrypted secrets:\n\n```yaml\nsteps:\n  - name: Deploy\n    env:\n      AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}\n      DATABASE_URL: ${{ secrets.DATABASE_URL }}\n    run: ./deploy.sh\n```\n\nFor more complex setups, use HashiCorp Vault or AWS Secrets Manager. Rotate secrets regularly and use OIDC for cloud provider auth instead of long-lived keys."},
        {"role": "user", "content": "Design a complete CI/CD pipeline for a microservices architecture with 5 services, including automated testing, security scanning, container building, multi-environment deployment, rollback strategy, and monitoring integration. Include the full GitHub Actions configuration."},
    ]},
    {"id": 40, "cat": "multi-turn", "messages": [
        {"role": "system", "content": "You are a distributed systems architect."},
        {"role": "user", "content": "What is the CAP theorem?"},
        {"role": "assistant", "content": "The CAP theorem states that a distributed system can only guarantee two of three properties:\n- Consistency: every read gets the latest write\n- Availability: every request gets a response\n- Partition tolerance: system works despite network failures\n\nSince network partitions are inevitable, you really choose between CP (consistent but may reject requests) and AP (available but may serve stale data)."},
        {"role": "user", "content": "How does eventual consistency work?"},
        {"role": "assistant", "content": "Eventual consistency means replicas converge to the same state given enough time without new updates.\n\nMechanisms:\n1. Anti-entropy: background gossip protocol syncs replicas\n2. Read repair: fix stale reads on detection\n3. Vector clocks: track causality to resolve conflicts\n\nExample: DynamoDB uses last-writer-wins with vector clocks. Cassandra uses timestamp-based conflict resolution."},
        {"role": "user", "content": "What about consensus algorithms?"},
        {"role": "assistant", "content": "Main consensus algorithms:\n\n**Raft**: Leader-based, understandable. Used in etcd, Consul. Leader election + log replication.\n\n**Paxos**: More theoretical, harder to implement. Single-decree and Multi-Paxos variants.\n\n**PBFT**: Byzantine fault tolerant, handles malicious nodes. Used in some blockchain systems. Requires 3f+1 nodes for f failures.\n\nRaft is the practical choice for most systems."},
        {"role": "user", "content": "How do I handle distributed transactions?"},
        {"role": "assistant", "content": "Options:\n\n1. **Two-Phase Commit (2PC)**: Coordinator asks all participants to prepare, then commit. Blocking if coordinator fails.\n\n2. **Saga Pattern**: Chain of local transactions with compensating actions for rollback. Better for microservices.\n\n3. **Outbox Pattern**: Write events to an outbox table atomically, then publish asynchronously.\n\n```python\n# Saga example\nasync def create_order_saga():\n    order = await create_order()       # Step 1\n    try:\n        await reserve_inventory(order)  # Step 2\n        await charge_payment(order)     # Step 3\n    except Exception:\n        await compensate(order)         # Rollback\n```"},
        {"role": "user", "content": "Design a complete distributed system architecture for a global e-commerce platform handling 1M concurrent users, covering data partitioning, replication strategy, consensus protocol selection, distributed caching, event sourcing, CQRS, and cross-region failover. Include implementation details and trade-off analysis."},
    ]},
]

# Model mapping
TIER_TO_MODEL = {"simple": "haiku", "medium": "sonnet", "complex": "opus"}
MODEL_PRICING = {
    "haiku":  {"input": 1.0,  "output": 5.0},   # per 1M tokens
    "sonnet": {"input": 3.0,  "output": 15.0},
    "opus":   {"input": 5.0,  "output": 25.0},
}


def estimate_cost(model: str, prompt: str, response: str) -> float:
    """Estimate cost in dollars based on token approximation."""
    tok_in = len(prompt.split()) * 1.3
    tok_out = len(response.split()) * 1.3
    pricing = MODEL_PRICING.get(model, MODEL_PRICING["opus"])
    return (tok_in * pricing["input"] + tok_out * pricing["output"]) / 1_000_000


def cli_call(prompt: str, model: str, timeout: int = 120) -> Tuple[str, float]:
    """Call Claude CLI and return (response, latency_ms)."""
    start = time.time()
    try:
        result = subprocess.run(
            ["claude", "-p", "--model", model],
            input=prompt,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        latency = (time.time() - start) * 1000
        return result.stdout.strip(), latency
    except subprocess.TimeoutExpired:
        return "[TIMEOUT]", timeout * 1000
    except Exception as e:
        return f"[ERROR: {e}]", 0


def classify_prompt(prompt: str) -> str:
    """Classify using the heuristic classifier."""
    try:
        # Direct import to avoid heavy dependency chain
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "hc", os.path.join(os.path.dirname(__file__), "..", "app", "complexity", "heuristic_classifier.py")
        )
        hc = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(hc)
        c = hc.HeuristicClassifier.__new__(hc.HeuristicClassifier)
        c.allowed_providers = []
        c.allowed_models = []
        c.performance_data = []
        tier, _, _ = c.classify(prompt)
        return tier
    except Exception:
        return "medium"  # safe fallback


def judge_quality(prompt: str, resp_a: str, model_a: str, resp_b: str, model_b: str) -> Dict:
    """Use Sonnet as LLM judge to compare two responses."""
    judge_prompt = f"""You are an expert evaluator. Rate these two AI responses on a scale of 1-10 for accuracy, completeness, and clarity.

Question: {prompt}

Response A ({model_a}):
{resp_a[:600]}

Response B ({model_b}):
{resp_b[:600]}

Return ONLY valid JSON: {{"a": <score>, "b": <score>, "verdict": "EQUAL"|"A_BETTER"|"B_BETTER"}}
A verdict of EQUAL means both are acceptable. B_BETTER means the baseline (opus) was significantly better."""

    out, _ = cli_call(judge_prompt, "sonnet", timeout=60)
    try:
        m = re.search(r'\{[^}]+\}', out)
        if m:
            return json.loads(m.group())
    except Exception:
        pass
    return {"a": 0, "b": 0, "verdict": "ERROR"}


def format_messages_as_prompt(messages: List[Dict[str, str]]) -> str:
    """Format a multi-turn conversation into a single prompt string for CLI."""
    parts = []
    for msg in messages:
        role = msg["role"].capitalize()
        parts.append(f"[{role}]: {msg['content']}")
    return "\n".join(parts)


def _safe_transforms(text: str) -> str:
    """Safe context optimizations: whitespace normalization and markdown noise removal."""
    # Normalize whitespace: collapse runs of spaces/tabs (not newlines) to single space
    text = re.sub(r'[^\S\n]+', ' ', text)
    # Collapse 3+ consecutive newlines to 2
    text = re.sub(r'\n{3,}', '\n\n', text)
    # Strip markdown formatting noise: bold, italic, inline code markers
    text = re.sub(r'\*{1,2}([^*]+)\*{1,2}', r'\1', text)  # **bold** / *italic*
    text = re.sub(r'`([^`]+)`', r'\1', text)                # `inline code`
    # Remove markdown heading markers (keep the text)
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    # Remove horizontal rules
    text = re.sub(r'^[-*_]{3,}\s*$', '', text, flags=re.MULTILINE)
    # Clean up any resulting double-blank lines again
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _truncate_conversation(messages: List[Dict[str, str]]) -> List[Dict[str, str]]:
    """Truncate multi-turn conversation: keep system + last 2 user messages + last assistant message.

    This simulates what the real aggressive optimizer does — drops the middle of
    the conversation to save tokens while preserving context (system prompt) and
    the most recent exchange.
    """
    system_msgs = [m for m in messages if m["role"] == "system"]
    user_msgs = [m for m in messages if m["role"] == "user"]
    assistant_msgs = [m for m in messages if m["role"] == "assistant"]

    kept = list(system_msgs)  # always keep system messages
    # Keep last assistant message (if any) for context continuity
    if assistant_msgs:
        kept.append(assistant_msgs[-1])
    # Keep last 2 user messages
    kept.extend(user_msgs[-2:] if len(user_msgs) >= 2 else user_msgs)

    return kept


def context_optimize(prompt_or_messages, mode: str):
    """Apply context optimization for benchmark.

    Accepts either a plain string (single-turn) or a list of message dicts (multi-turn).
    Returns the optimized prompt string ready for CLI.

    Modes:
      safe       — normalize whitespace, collapse empty lines, strip markdown formatting
      aggressive — all safe transforms PLUS truncate conversation history (multi-turn)
    """
    # Handle multi-turn conversations (list of message dicts)
    if isinstance(prompt_or_messages, list):
        messages = prompt_or_messages
        if mode == "aggressive":
            # Truncate conversation before formatting
            messages = _truncate_conversation(messages)
        # Apply safe text transforms to each message's content
        cleaned = []
        for msg in messages:
            cleaned.append({
                "role": msg["role"],
                "content": _safe_transforms(msg["content"]),
            })
        return format_messages_as_prompt(cleaned)

    # Handle single-turn string prompts
    text = prompt_or_messages
    if mode == "safe":
        return _safe_transforms(text)
    elif mode == "aggressive":
        # For single-turn, aggressive is the same as safe (no conversation to truncate)
        return _safe_transforms(text)
    return text


def run_variant(prompts: List[Dict], variant: str) -> List[Dict]:
    """Run a single variant across all prompts."""
    results = []
    for p in prompts:
        is_multi_turn = "messages" in p
        # For multi-turn prompts, build the raw prompt by formatting all messages
        # For single-turn, use the prompt string directly
        raw_prompt = format_messages_as_prompt(p["messages"]) if is_multi_turn else p["prompt"]
        # For classification, use the last user message (multi-turn) or the prompt (single-turn)
        classify_text = p["messages"][-1]["content"] if is_multi_turn else p["prompt"]

        # Determine model and optimization
        if variant == "V1":  # Baseline: always opus
            model = "opus"
            prompt_text = raw_prompt
        elif variant == "V2":  # Router only
            tier = classify_prompt(classify_text)
            model = TIER_TO_MODEL[tier]
            prompt_text = raw_prompt
        elif variant == "V3":  # Safe optimize only
            model = "opus"
            prompt_text = context_optimize(p["messages"] if is_multi_turn else p["prompt"], "safe")
        elif variant == "V4":  # Router + Safe
            tier = classify_prompt(classify_text)
            model = TIER_TO_MODEL[tier]
            prompt_text = context_optimize(p["messages"] if is_multi_turn else p["prompt"], "safe")
        elif variant == "V5":  # Aggressive optimize only
            model = "opus"
            prompt_text = context_optimize(p["messages"] if is_multi_turn else p["prompt"], "aggressive")
        elif variant == "V6":  # Router + Aggressive
            tier = classify_prompt(classify_text)
            model = TIER_TO_MODEL[tier]
            prompt_text = context_optimize(p["messages"] if is_multi_turn else p["prompt"], "aggressive")
        else:
            raise ValueError(f"Unknown variant: {variant}")

        response, latency = cli_call(prompt_text, model)
        cost = estimate_cost(model, prompt_text, response)

        results.append({
            "prompt_id": p["id"],
            "category": p.get("cat", "multi-turn"),
            "variant": variant,
            "model": model,
            "tier": classify_prompt(classify_text) if "V2" in variant or "V4" in variant or "V6" in variant else "n/a",
            "cost": round(cost, 6),
            "latency_ms": round(latency, 1),
            "response_length": len(response),
            "response_preview": response[:200],
            "optimized": variant in ("V3", "V4", "V5", "V6"),
            "optimize_mode": "safe" if variant in ("V3", "V4") else "aggressive" if variant in ("V5", "V6") else "none",
        })

        cat_label = p.get("cat", "multi-turn")
        print(f"  {variant} #{p['id']:2d} [{cat_label:10s}] → {model:7s} ${cost:.6f} {latency:.0f}ms")

    return results


def run_judge(prompts: List[Dict], baseline: List[Dict], variant_results: List[Dict], variant: str) -> List[Dict]:
    """Judge variant results against baseline."""
    judgments = []
    for base, var in zip(baseline, variant_results):
        if var["response_preview"] == base["response_preview"]:
            # Same response, skip judging
            judgments.append({"a": 10, "b": 10, "verdict": "EQUAL"})
            continue

        p = prompts[base["prompt_id"] - 1]
        # For multi-turn prompts, use the last user message as the judge prompt
        judge_p = p["messages"][-1]["content"] if "messages" in p else p["prompt"]
        j = judge_quality(
            judge_p,
            var["response_preview"], var["model"],
            base["response_preview"], "opus",
        )
        judgments.append(j)
        v = j.get("verdict", "?")
        print(f"  Judge #{base['prompt_id']:2d}: A({var['model']}):{j.get('a',0)} B(opus):{j.get('b',0)} → {v}")
        time.sleep(1)  # Rate limit

    return judgments


def main():
    parser = argparse.ArgumentParser(description="Nadir 6-way Benchmark")
    parser.add_argument("--prompts", type=int, default=40, help="Number of prompts (default: 40)")
    parser.add_argument("--output", type=str, default="benchmark/results", help="Output directory")
    parser.add_argument("--skip-judge", action="store_true", help="Skip LLM judge (faster)")
    parser.add_argument("--variants", nargs="+", default=["V1", "V2", "V3", "V4", "V5", "V6"])
    args = parser.parse_args()

    prompts = PROMPTS[:args.prompts]
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")

    print("╔═══════════════════════════════════════════════════════════════╗")
    print("║  NADIR BENCHMARK — 6-Way Comparison                         ║")
    print(f"║  {len(prompts)} prompts × {len(args.variants)} variants = {len(prompts) * len(args.variants)} API calls                        ║")
    print(f"║  {timestamp}                                  ║")
    print("╚═══════════════════════════════════════════════════════════════╝\n")

    all_results = {}
    baseline = None

    for variant in args.variants:
        label = {
            "V1": "Baseline (Opus)",
            "V2": "Router Only",
            "V3": "Safe Optimize",
            "V4": "Router + Safe",
            "V5": "Aggressive Optimize",
            "V6": "Router + Aggressive",
        }.get(variant, variant)

        print(f"\n{'━' * 60}")
        print(f"  {variant}: {label}")
        print(f"{'━' * 60}")

        results = run_variant(prompts, variant)
        all_results[variant] = results

        if variant == "V1":
            baseline = results

    # ── Judge quality ──
    judgments = {}
    if not args.skip_judge and baseline:
        print(f"\n{'━' * 60}")
        print("  LLM-as-Judge (Sonnet evaluating quality)")
        print(f"{'━' * 60}")

        for variant in args.variants:
            if variant == "V1":
                continue
            print(f"\n  Judging {variant} vs Baseline:")
            judgments[variant] = run_judge(prompts, baseline, all_results[variant], variant)

    # ── Summary ──
    print(f"\n{'═' * 70}")
    print("  RESULTS SUMMARY")
    print(f"{'═' * 70}\n")

    summary = {}
    for variant in args.variants:
        results = all_results[variant]
        total_cost = sum(r["cost"] for r in results)
        avg_latency = sum(r["latency_ms"] for r in results) / len(results)

        savings_pct = 0
        if baseline and variant != "V1":
            baseline_cost = sum(r["cost"] for r in baseline)
            savings_pct = (1 - total_cost / baseline_cost) * 100 if baseline_cost > 0 else 0

        quality_maintained = 0
        quality_total = 0
        avg_score_a = 0
        avg_score_b = 0
        if variant in judgments:
            jl = judgments[variant]
            quality_total = len(jl)
            quality_maintained = sum(1 for j in jl if j.get("verdict") in ("EQUAL", "A_BETTER", "A_OK"))
            avg_score_a = sum(j.get("a", 0) for j in jl) / max(len(jl), 1)
            avg_score_b = sum(j.get("b", 0) for j in jl) / max(len(jl), 1)

        label = {"V1": "Baseline", "V2": "Router", "V3": "Safe", "V4": "Router+Safe",
                 "V5": "Aggressive", "V6": "Router+Aggr"}.get(variant, variant)

        quality_str = f"{quality_maintained}/{quality_total}" if quality_total > 0 else "n/a"
        print(f"  {label:14s} | ${total_cost:.5f} | {savings_pct:+5.0f}% | {avg_latency:6.0f}ms | quality: {quality_str}")

        summary[variant] = {
            "label": label,
            "total_cost": round(total_cost, 6),
            "savings_pct": round(savings_pct, 1),
            "avg_latency_ms": round(avg_latency, 1),
            "quality_maintained": quality_maintained,
            "quality_total": quality_total,
            "avg_score_routed": round(avg_score_a, 1),
            "avg_score_baseline": round(avg_score_b, 1),
        }

    # ── Per-category breakdown ──
    if baseline:
        print(f"\n  Per-category savings (Router+Aggressive):")
        v6 = all_results.get("V6", all_results.get("V4", []))
        for cat in ["simple", "medium", "complex", "multi-turn"]:
            base_cat = sum(r["cost"] for r in baseline if r["category"] == cat)
            v6_cat = sum(r["cost"] for r in v6 if r["category"] == cat)
            sav = (1 - v6_cat / base_cat) * 100 if base_cat > 0 else 0
            print(f"    {cat:8s}: ${base_cat:.5f} → ${v6_cat:.5f} ({sav:+.0f}%)")

    # ── Save results ──
    output = {
        "timestamp": timestamp,
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "num_prompts": len(prompts),
        "variants": args.variants,
        "summary": summary,
        "detailed_results": {v: all_results[v] for v in args.variants},
        "judgments": {v: judgments.get(v, []) for v in args.variants if v != "V1"},
        "classifier_version": "heuristic-v1.0",
    }

    output_file = output_dir / f"benchmark_{timestamp}.json"
    with open(output_file, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\n  Results saved to: {output_file}")

    # Also save latest as a symlink-like file
    latest_file = output_dir / "latest.json"
    with open(latest_file, "w") as f:
        json.dump(output, f, indent=2)
    print(f"  Latest copy: {latest_file}")

    print(f"\n{'═' * 70}")
    best = min(summary.items(), key=lambda x: x[1]["total_cost"] if x[0] != "V1" else float("inf"))
    print(f"  Best value: {best[1]['label']} — {best[1]['savings_pct']}% savings")
    print(f"{'═' * 70}\n")


if __name__ == "__main__":
    main()
