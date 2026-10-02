begin;
insert into public.topic_specializations(topic_id,parent_id,name,slug,description,sort_order)
select t.id,p.id,v.name,v.slug,v.description,v.sort_order from public.topics t
join (values
 ('programming-languages','C# và .NET','programming-csharp-dotnet','C#, CLR, LINQ, ASP.NET Core, async/await và quản lý bộ nhớ.',50),
 ('programming-languages','PHP và Laravel','programming-php-laravel','PHP, Laravel, Eloquent, middleware, queue và thiết kế ứng dụng.',60),
 ('programming-languages','Kotlin và Swift','programming-kotlin-swift','Kotlin, coroutine, Swift, optional và lập trình ứng dụng.',70),
 ('web-development','Spring Boot và Spring Security','web-spring-security','Spring Boot, DI, JPA, transaction, JWT, OAuth và phân quyền.',30),
 ('web-development','React, Next.js và TypeScript','web-react-nextjs','React hooks, SSR, routing, cache, accessibility và TypeScript.',40),
 ('web-development','GraphQL và gRPC','web-graphql-grpc','Schema, resolver, protobuf, streaming và thiết kế API.',50),
 ('databases','PostgreSQL','database-postgresql','Kiểu dữ liệu, SQL, index, EXPLAIN, MVCC và RLS.',50),
 ('databases','SQL Server','database-sqlserver','T-SQL, index, transaction, stored procedure và SQL Server.',60),
 ('databases','MySQL và MariaDB','database-mysql','SQL, InnoDB, transaction và tối ưu truy vấn.',70),
 ('databases','Redis và cache','database-redis','Cache, expiration, eviction, data structure và nhất quán cache.',80),
 ('cloud-devops','AWS, Azure và Google Cloud','devops-cloud-platforms','Dịch vụ cloud, IAM, network, compute, storage và triển khai.',40),
 ('cloud-devops','Infrastructure as Code','devops-iac','Terraform, cấu hình hạ tầng, state và provisioning.',50),
 ('distributed-systems','Microservices và event-driven','distributed-microservices','Phân rã dịch vụ, messaging, saga, outbox và idempotency.',20),
 ('distributed-systems','Kafka và RabbitMQ','distributed-messaging','Topic, queue, partition, delivery và consumer.',30),
 ('artificial-intelligence','Computer vision','ai-computer-vision','Ảnh, đặc trưng, CNN, detection, segmentation và đánh giá.',50),
 ('artificial-intelligence','MLOps và triển khai mô hình','ai-mlops','Dataset, experiment, versioning, serving và model monitoring.',60),
 ('artificial-intelligence','Xử lý ngôn ngữ tự nhiên','ai-nlp','Tokenization, embedding, transformer và bài toán NLP.',70),
 ('software-engineering','Agile, Scrum và quản lý yêu cầu','engineering-agile','Backlog, user story, sprint, acceptance criteria và traceability.',30),
 ('software-engineering','Thiết kế trải nghiệm người dùng','engineering-hci-ux','HCI, usability, accessibility, flow và đánh giá UX.',40),
 ('software-testing','Kiểm thử bảo mật','testing-security','Threat modeling, SAST/DAST, kiểm tra phân quyền và dữ liệu.',30),
 ('computer-architecture','Hệ thống nhúng và IoT','architecture-embedded-iot','Vi điều khiển, firmware, RTOS, cảm biến, giao thức và IoT.',30),
 ('it-fundamentals','Toán rời rạc và logic','fundamentals-discrete-math','Tập hợp, quan hệ, logic, tổ hợp và chứng minh trong IT.',30),
 ('it-fundamentals','Xác suất và thống kê cho IT','fundamentals-statistics','Phân phối, ước lượng, kiểm định và dữ liệu trong IT.',40),
 ('software-engineering','Phát triển game','engineering-game-development','Game loop, engine, rendering, physics và kiến trúc game.',50)
) v(parent_slug,name,slug,description,sort_order) on true
join public.topic_specializations p on p.topic_id=t.id and p.slug=v.parent_slug where t.code='IT'
on conflict(topic_id,slug) do update set parent_id=excluded.parent_id,name=excluded.name,description=excluded.description,sort_order=excluded.sort_order,is_active=true;
-- Inherit canonical response schema; specialize the teaching context, never invent source facts.
insert into public.prompt_templates(purpose,topic_id,specialization_id,name,version,system_prompt,user_prompt_template,output_schema,model_config)
select 'section_generation',t.id,s.id,'DocuMind IT - '||s.slug,1,
base.system_prompt||E'\nChuyên ngành: '||s.name||'. Phạm vi: '||s.description||E'\nChỉ giải thích kiến thức có trong nguồn; giữ bảng hàng/cột, đơn vị và số liệu. Ví dụ bổ sung phải gắn metadata.isSupplementary=true. Không suy diễn quan hệ hoặc giá trị chưa có.',
base.user_prompt_template,base.output_schema,base.model_config
from public.topics t join public.topic_specializations s on s.topic_id=t.id
join public.prompt_templates base on base.topic_id=t.id and base.purpose='section_generation' and base.name='DocuMind IT - phân tích tài liệu kỹ thuật'
where t.code='IT' and s.slug in ('programming-csharp-dotnet','programming-php-laravel','programming-kotlin-swift','web-spring-security','web-react-nextjs','web-graphql-grpc','database-postgresql','database-sqlserver','database-mysql','database-redis','devops-cloud-platforms','devops-iac','distributed-microservices','distributed-messaging','ai-computer-vision','ai-mlops','ai-nlp','engineering-agile','engineering-hci-ux','testing-security','architecture-embedded-iot','fundamentals-discrete-math','fundamentals-statistics','engineering-game-development')
on conflict(purpose,name,version) do update set system_prompt=excluded.system_prompt,user_prompt_template=excluded.user_prompt_template,output_schema=excluded.output_schema,model_config=excluded.model_config,is_active=true;
commit;
