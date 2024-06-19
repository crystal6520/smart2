#include <Servo.h>

#define ServoPin 22

Servo servoMotor;
int feedCount = 0;              // 먹이를 줄 횟수
unsigned long feedInterval = 0; // 먹이를 줄 시간 간격 (밀리초 단위)
unsigned long lastFeedTime = 0; // 마지막으로 먹이를 준 시간
bool feedingInProgress = false; // 먹이 주기가 진행 중인지 여부
String inputString;

void setup() {
  Serial.begin(9600);
  servoMotor.attach(ServoPin);
  servoMotor.write(0);
}

void loop() {
  if (Serial.available() > 0) {
    inputString = Serial.readStringUntil('\n');
    Serial.println(inputString);
    inputString.trim();                       // 문자열 앞뒤 공백 제거
    if (inputString.startsWith("FEED")) {
      feedingInProgress = false;              // 현재 진행 중인 먹이 주기 작업 중단
      processInput(inputString);
    }
  }
  
  if (feedingInProgress && millis() - lastFeedTime >= feedInterval) {
    lastFeedTime = millis();                  // 마지막 먹이 주기 시간 업데이트
    Serial.println(lastFeedTime);
    for(int i = 0; i < feedCount; i++) {
      feedFish();
    }
  }

  static unsigned long previousPrintTime = 0;
  if (feedingInProgress && millis() - previousPrintTime >= 1000) { // 매 1초마다
    previousPrintTime = millis();
    Serial.print("Elapsed Time: ");
    Serial.print(previousPrintTime / 1000);
    Serial.println(" seconds");
  }
}

void processInput(String input) {
  feedCount = getFeedCount(input);            // 먹이 공급 횟수 추출
  feedInterval = getTimeDelay(input) * 1000;  // 주어진 간격을 밀리초로 변환
  feedingInProgress = true;                   // 먹이 주기 시작
  lastFeedTime = millis() - feedInterval;     // 즉시 첫 번째 먹이 주기를 시작하기 위해 설정
}

void feedFish() {
  servoMotor.write(90);
  delay(1000);
  servoMotor.write(0);
  delay(1000);
}

int getFeedCount(String input) {
  String feedCountString = input.substring(input.indexOf(' ') + 1, input.indexOf('T') - 1);
  return feedCountString.toInt(); // 횟수 반환
}

long getTimeDelay(String input) {
  int timeIndex = input.indexOf("TIME") + 5;
  String timeString = input.substring(timeIndex);
  int colonIndex = timeString.indexOf(":");
  int hours = timeString.substring(0, colonIndex).toInt();
  int minutes = timeString.substring(colonIndex + 1).toInt();

  return (hours * 3600 + minutes * 60); // 지연 시간을 초 단위로 반환
}
