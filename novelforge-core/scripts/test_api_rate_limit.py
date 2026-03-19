import asyncio
import aiohttp
import time
from datetime import datetime
import os
from dotenv import load_dotenv

# 加载环境变量
load_dotenv('novelforge-core/.env')

# 从环境变量获取配置
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
OPENAI_BASE_URL = os.getenv('OPENAI_BASE_URL')
OPENAI_MODEL = os.getenv('OPENAI_MODEL')
RPM_LIMIT = int(os.getenv('RPM_LIMIT', 50))
TPM_LIMIT = int(os.getenv('TPM_LIMIT', 3000000))

class APITester:
    def __init__(self, api_key, base_url, model):
        self.api_key = api_key
        self.base_url = base_url
        self.model = model
        self.headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json'
        }
    
    async def make_request(self, session, request_id=None):
        """发送单个API请求"""
        url = f"{self.base_url}/chat/completions"
        
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": "Hello, how are you? This is a test request to check API rate limits."
                }
            ],
            "max_tokens": 10
        }
        
        start_time = time.time()
        try:
            async with session.post(url, headers=self.headers, json=payload) as response:
                response_time = time.time() - start_time
                status = response.status
                response_text = await response.text()
                
                if status == 200:
                    print(f"✓ Request {request_id or ''} successful in {response_time:.2f}s")
                    return {'success': True, 'response_time': response_time, 'status': status}
                else:
                    print(f"✗ Request {request_id or ''} failed with status {status}: {response_text}")
                    return {'success': False, 'response_time': response_time, 'status': status, 'error': response_text}
        except Exception as e:
            response_time = time.time() - start_time
            print(f"✗ Request {request_id or ''} error: {str(e)}")
            return {'success': False, 'response_time': response_time, 'error': str(e)}
    
    async def test_concurrent_requests(self, num_requests, delay=0):
        """测试并发请求"""
        print(f"\n开始测试 {num_requests} 个并发请求...")
        start_time = time.time()
        
        async with aiohttp.ClientSession() as session:
            tasks = []
            for i in range(num_requests):
                if delay > 0:
                    await asyncio.sleep(delay)
                task = asyncio.create_task(self.make_request(session, i+1))
                tasks.append(task)
            
            results = await asyncio.gather(*tasks)
        
        total_time = time.time() - start_time
        successful_requests = sum(1 for r in results if r['success'])
        
        print(f"\n测试结果:")
        print(f"总请求数: {num_requests}")
        print(f"成功请求数: {successful_requests}")
        print(f"失败请求数: {num_requests - successful_requests}")
        print(f"总耗时: {total_time:.2f}秒")
        print(f"成功率: {successful_requests/num_requests*100:.2f}%")
        print(f"平均响应时间: {sum(r.get('response_time', 0) for r in results)/len(results):.2f}秒")
        
        return results
    
    async def find_rate_limits(self):
        """尝试找到实际的速率限制"""
        print(f"\n开始测试API速率限制...")
        print(f"配置的RPM限制: {RPM_LIMIT}")
        print(f"配置的TPM限制: {TPM_LIMIT}")
        
        # 测试不同并发数下的表现
        test_results = {}
        
        # 逐步增加并发数以找到临界点
        for concurrent_requests in [10, 20, 30, RPM_LIMIT, RPM_LIMIT+20]:
            print(f"\n正在测试 {concurrent_requests} 个并发请求...")
            
            start_time = time.time()
            results = await self.test_concurrent_requests(concurrent_requests)
            end_time = time.time()
            
            successful_count = sum(1 for r in results if r['success'])
            rate = successful_count / (end_time - start_time)
            test_results[concurrent_requests] = {
                'successful_requests': successful_count,
                'total_time': end_time - start_time,
                'rate_per_minute': rate * 60,
                'success_rate': successful_count / concurrent_requests
            }
            
            print(f"并发数 {concurrent_requests}: 成功率 {test_results[concurrent_requests]['success_rate']*100:.2f}%, "
                  f"实际速率 {test_results[concurrent_requests]['rate_per_minute']:.2f} RPM")
            
            # 如果成功率大幅下降，可能已经达到了速率限制
            if test_results[concurrent_requests]['success_rate'] < 0.8:
                print(f"注意: 在 {concurrent_requests} 个并发请求时成功率下降到 {test_results[concurrent_requests]['success_rate']*100:.2f}%，"
                      f"可能已达到速率限制")
        
        return test_results

async def main():
    print("API请求速率测试工具")
    print("="*50)
    print(f"API密钥: {'*' * 20}{OPENAI_API_KEY[-10:] if OPENAI_API_KEY else 'NOT SET'}")
    print(f"API基础URL: {OPENAI_BASE_URL}")
    print(f"模型: {OPENAI_MODEL}")
    print(f"配置RPM限制: {RPM_LIMIT}")
    print(f"配置TPM限制: {TPM_LIMIT:,}")
    print("="*50)
    
    tester = APITester(OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL)
    
    while True:
        print("\n选择测试选项:")
        print("1. 测试特定数量的并发请求")
        print("2. 自动测试速率限制")
        print("3. 单个请求测试")
        print("4. 退出")
        
        choice = input("\n请输入选项 (1-4): ")
        
        if choice == '1':
            try:
                num_requests = int(input("请输入要发送的并发请求数量: "))
                delay = float(input("请输入请求间的延迟(秒, 0为无延迟): ") or 0)
                await tester.test_concurrent_requests(num_requests, delay)
            except ValueError:
                print("输入无效，请输入数字")
        
        elif choice == '2':
            await tester.find_rate_limits()
        
        elif choice == '3':
            async with aiohttp.ClientSession() as session:
                await tester.make_request(session, "single")
        
        elif choice == '4':
            print("退出测试")
            break
        
        else:
            print("无效选项，请重新选择")

if __name__ == "__main__":
    asyncio.run(main())