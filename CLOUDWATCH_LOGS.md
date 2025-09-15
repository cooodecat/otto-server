# CloudWatch Logs API Module

Otto Server의 AWS CloudWatch Logs 연동 모듈 문서입니다. CodeBuild 실행 로그를 CloudWatch에서 조회하여 원본 데이터를 제공합니다.

## 개요

이 모듈은 팀 협업 프로젝트의 로그 수집 기능을 담당하며, 다음과 같은 역할을 수행합니다:

- **CodeBuild ID → CloudWatch Log 매핑**: CodeBuild API를 통해 Build ID로 Log Group/Stream 정보 조회
- **원본 로그 데이터 반환**: CloudWatch Logs에서 가져온 데이터를 파싱 없이 그대로 제공
- **에러 핸들링**: 재시도 로직과 적절한 에러 처리
- **페이지네이션**: 대용량 로그 데이터 효율적 조회

## 환경 설정

### 필수 환경 변수

`.env.development` 또는 `.env` 파일에 다음 설정을 추가하세요:

```env
# AWS CloudWatch Logs API 설정 (필수)
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
```

### AWS IAM 권한 요구사항

사용하는 AWS Access Key에는 다음 권한이 필요합니다:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:GetLogEvents",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["codebuild:BatchGetBuilds"],
      "Resource": "*"
    }
  ]
}
```

## API 엔드포인트

모든 엔드포인트는 Supabase 인증이 필요합니다.

### 1. 전체 로그 조회

**GET** `/api/v1/cloudwatch-logs/raw`

CodeBuild ID로 모든 로그를 조회합니다.

**Query Parameters:**

- `codebuildId` (required): CodeBuild Build ID

**Example Request:**

```bash
curl -X GET "http://localhost:4000/api/v1/cloudwatch-logs/raw?codebuildId=my-project:12345678-1234-1234-1234-123456789012" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Example Response:**

```json
[
  {
    "timestamp": "2024-01-15T10:30:45.123Z",
    "message": "[Container] 2024/01/15 10:30:45 Running command npm install",
    "logStream": "my-project/12345678-1234-1234-1234-123456789012",
    "eventId": "37516444617598064848979944537842033274675012345"
  }
]
```

### 2. 시간 범위별 로그 조회

**GET** `/api/v1/cloudwatch-logs/range`

특정 시간 범위의 로그를 페이지네이션과 함께 조회합니다.

**Query Parameters:**

- `codebuildId` (required): CodeBuild Build ID
- `startTime` (optional): ISO 8601 형식 시작 시간
- `endTime` (optional): ISO 8601 형식 종료 시간
- `limit` (optional): 조회할 로그 개수 (기본값: 1000, 최대: 10000)
- `nextToken` (optional): 페이지네이션을 위한 토큰

**Example Request:**

```bash
curl -X GET "http://localhost:4000/api/v1/cloudwatch-logs/range?codebuildId=my-project:12345678-1234-1234-1234-123456789012&startTime=2024-01-15T10:00:00.000Z&endTime=2024-01-15T11:00:00.000Z&limit=100" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Example Response:**

```json
{
  "logs": [
    {
      "timestamp": "2024-01-15T10:30:45.123Z",
      "message": "[Container] 2024/01/15 10:30:45 Running command npm install",
      "logStream": "my-project/12345678-1234-1234-1234-123456789012",
      "eventId": "37516444617598064848979944537842033274675012345"
    }
  ],
  "nextToken": "f/37516444617598064848979944537842033274675012345",
  "hasMore": true
}
```

## TypeScript 인터페이스

### 팀원 사용 인터페이스

```typescript
interface CloudWatchLogsService {
  // 원본 로그 데이터 반환 (파싱 없음)
  getRawLogs(codebuildId: string): Promise<RawLogEntry[]>;

  // 특정 시간 범위 로그 조회
  getRawLogsInRange(
    codebuildId: string,
    startTime?: Date,
    endTime?: Date,
    limit?: number,
  ): Promise<LogQueryResult>;

  // 페이지네이션 지원 로그 조회
  getLogsPaginated(
    codebuildId: string,
    options: LogQueryOptions,
  ): Promise<LogQueryResult>;
}
```

### 데이터 타입 정의

```typescript
interface RawLogEntry {
  timestamp: Date; // 로그 발생 시간
  message: string; // 원본 메시지 (파싱 전)
  logStream: string; // CloudWatch Log Stream 이름
  eventId: string; // 고유 이벤트 ID
}

interface LogQueryResult {
  logs: RawLogEntry[]; // 조회된 로그 엔트리들
  nextToken?: string; // 다음 페이지 토큰
  hasMore: boolean; // 추가 데이터 존재 여부
}

interface LogQueryOptions {
  startTime?: Date; // 조회 시작 시간
  endTime?: Date; // 조회 종료 시간
  limit?: number; // 조회할 로그 개수
  nextToken?: string; // 페이지네이션 토큰
}
```

## 사용 예시

### NestJS 서비스에서 사용

```typescript
import { Injectable } from '@nestjs/common';
import { CloudWatchLogsService } from '../cloudwatch-logs/cloudwatch-logs.service';

@Injectable()
export class MyService {
  constructor(private readonly cloudWatchLogsService: CloudWatchLogsService) {}

  async processCodeBuildLogs(buildId: string): Promise<void> {
    // 전체 로그 조회
    const logs = await this.cloudWatchLogsService.getRawLogs(buildId);

    // 여기서 팀원이 로그 파싱 및 처리 수행
    logs.forEach((log) => {
      console.log(`${log.timestamp}: ${log.message}`);
    });
  }

  async getRecentLogs(buildId: string): Promise<RawLogEntry[]> {
    // 최근 1시간 로그만 조회
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const now = new Date();

    const result = await this.cloudWatchLogsService.getRawLogsInRange(
      buildId,
      oneHourAgo,
      now,
      500,
    );

    return result.logs;
  }
}
```

### 페이지네이션 사용 예시

```typescript
async getAllLogsWithPagination(buildId: string): Promise<RawLogEntry[]> {
  const allLogs: RawLogEntry[] = [];
  let nextToken: string | undefined;

  do {
    const result = await this.cloudWatchLogsService.getLogsPaginated(buildId, {
      limit: 1000,
      nextToken,
    });

    allLogs.push(...result.logs);
    nextToken = result.nextToken;
  } while (nextToken);

  return allLogs;
}
```

## 에러 핸들링 및 재시도 로직

### 자동 재시도

모듈은 다음과 같은 AWS API 호출에 대해 자동 재시도를 수행합니다:

- **CodeBuild API**: 최대 3회 재시도 (1초 간격)
- **CloudWatch Logs API**: 최대 5회 재시도 (2초 시작, 지수 백오프)

### 재시도 대상 에러

다음 에러들에 대해서만 재시도합니다:

- `ThrottlingException`: API 호출 제한 초과
- `TooManyRequestsException`: 요청 과다
- `ServiceUnavailableException`: 서비스 일시 중단
- `InternalServerError`: AWS 내부 서버 오류
- HTTP 5xx 상태 코드

### 에러 타입

```typescript
// CodeBuild를 찾을 수 없는 경우
throw new NotFoundException(`CodeBuild with ID ${buildId} not found`);

// CloudWatch 로그 정보가 없는 경우
throw new NotFoundException(
  `Log information not available for CodeBuild ${buildId}`,
);

// AWS API 호출 실패
throw new InternalServerErrorException(
  'Failed to retrieve logs from CloudWatch',
);
```

## 모니터링 및 로깅

모듈은 다음과 같은 로그를 출력합니다:

```
[CloudWatchLogsService] Fetching logs for CodeBuild ID: my-project:12345...
[CloudWatchLogsRetryService] Attempt 1 failed, retrying in 2000ms. Error: ThrottlingException
[CloudWatchLogsController] Getting raw logs for CodeBuild ID: my-project:12345...
```

## 성능 고려사항

### CloudWatch Logs API 제한

- **GetLogEvents**: 초당 10회 호출 제한
- **응답 크기**: 최대 1MB 또는 10,000개 이벤트
- **시간 범위**: 최대 14일

### 권장사항

- 대용량 로그 조회 시 `limit` 파라미터로 배치 크기 조절
- 긴 시간 범위 조회 시 여러 번에 나누어 요청
- `nextToken`을 활용한 페이지네이션으로 메모리 사용량 최적화

## 문제 해결

### 일반적인 오류

1. **AWS 인증 오류**

   ```
   Error: The security token included in the request is invalid
   ```

   → AWS 환경 변수 설정 확인

2. **권한 부족**

   ```
   Error: User is not authorized to perform: logs:GetLogEvents
   ```

   → IAM 정책 확인

3. **CodeBuild 찾을 수 없음**

   ```
   NotFoundException: CodeBuild with ID xxx not found
   ```

   → CodeBuild ID 형식 확인 (프로젝트명:빌드ID)

4. **로그 스트림 없음**
   ```
   NotFoundException: Log information not available for CodeBuild xxx
   ```
   → CodeBuild가 완료되었는지 또는 로그 설정이 활성화되어 있는지 확인

## 관련 파일 구조

```
src/cloudwatch-logs/
├── cloudwatch-logs.module.ts           # NestJS 모듈 설정
├── cloudwatch-logs.controller.ts       # API 엔드포인트 컨트롤러
├── cloudwatch-logs.service.ts          # 메인 서비스 로직
├── cloudwatch-logs-retry.service.ts    # 재시도 로직 서비스
├── dto/
│   └── get-logs.dto.ts                 # API 요청 데이터 검증
└── types/
    └── cloudwatch.types.ts             # TypeScript 타입 정의
```

## 추가 개발 시 고려사항

1. **SSE (Server-Sent Events) 구현**: 실시간 로그 스트리밍
2. **로그 캐싱**: Redis를 활용한 자주 조회되는 로그 캐싱
3. **로그 필터링**: CloudWatch Logs Insights 쿼리 지원
4. **메트릭 수집**: 로그 조회 빈도 및 성능 모니터링

---

**문서 버전**: 1.0  
**최종 업데이트**: 2025-09-15  
**담당자**: rarjang
