#include <Arduino.h>
#include <EEPROM.h>

// EEPROM 주소 정의
#define EEPROM_ADDR_DO 0   // Door Open/Close Motor (12V)
#define EEPROM_ADDR_DC 1   // Door Close Motor
#define EEPROM_ADDR_D1 2   // Direction 1 Motor (24V)
#define EEPROM_ADDR_D2 3   // Direction 2 Motor (24V)
#define EEPROM_MAGIC 4     // 초기화 확인용
#define EEPROM_MAGIC_VAL 0xAB

// 기본 속도값
#define DEFAULT_SPEED_DO 255
#define DEFAULT_SPEED_DC 120
#define DEFAULT_SPEED_D1 70
#define DEFAULT_SPEED_D2 90

// 현재 모터 속도 (EEPROM에서 로드)
int speed_DO = DEFAULT_SPEED_DO;
int speed_DC = DEFAULT_SPEED_DC;
int speed_D1 = DEFAULT_SPEED_D1;
int speed_D2 = DEFAULT_SPEED_D2;

int seesaw_Sensor1 = 27;
int seesaw_Sensor2 = 28;
int openDoor_Sensor = 37;
int closeDoor_Sensor = 36;
int handSensor = 22;

// 상태 변수
int seesaw_State1 = 0;
int seesaw_State2 = 0;
int door_open_state = 0;
int door_close_state = 0;
int hand_State = 0;
int inverter_State = 0;
int fwd_State = 0;

// 24V DC MOTOR PIN
int ena_Pin = 6; 
int in1_Pin = 7;
int in2_Pin = 8;

// 12V DC MOTOR PIN
int enb_Pin = 11;
int in4_Pin = 10;
int in3_Pin = 9;

// Inverter PIN
int inverterPin = 50;
int fwdPin = 40;

// LED PIN
int led_Red = 46;
int led_Blue = 47;

// === 띠 분리기 관련 추가 ===
int labelSwitch = 24;  // 스위치 입력 핀
int labelSensor = 25;  // 센서 입력 핀
int labelMotor = 48;   // 모터 출력 핀

bool motorRunning = false;
bool switchPressed = false;
bool motorStarted = false;
int lastSensorState = HIGH;
bool labelCutterState = false;
bool labelOpenTriggered = false; // 문 열기 1회 트리거 가드
bool errorState = false; // 오류 상태 플래그

bool login = false;  // 로그인 상태 변수
bool adminMode = false; // [ADD] 관리자 모드 여부

void setup() {
    Serial1.begin(9600);

    // EEPROM 초기화 확인
    if (EEPROM.read(EEPROM_MAGIC) != EEPROM_MAGIC_VAL) {
        // 첫 실행 시 기본값 저장
        EEPROM.write(EEPROM_ADDR_DO, DEFAULT_SPEED_DO);
        EEPROM.write(EEPROM_ADDR_DC, DEFAULT_SPEED_DC);
        EEPROM.write(EEPROM_ADDR_D1, DEFAULT_SPEED_D1);
        EEPROM.write(EEPROM_ADDR_D2, DEFAULT_SPEED_D2);
        EEPROM.write(EEPROM_MAGIC, EEPROM_MAGIC_VAL);
    }

    // EEPROM에서 속도값 로드
    loadSpeedsFromEEPROM();

    // 기존 센서 핀 설정
    pinMode(seesaw_Sensor1, INPUT);
    pinMode(seesaw_Sensor2, INPUT);
    pinMode(openDoor_Sensor, INPUT);
    pinMode(closeDoor_Sensor, INPUT);
    pinMode(handSensor, INPUT);

    pinMode(ena_Pin, OUTPUT);
    pinMode(in1_Pin, OUTPUT);
    pinMode(in2_Pin, OUTPUT);

    pinMode(enb_Pin, OUTPUT);
    pinMode(in3_Pin, OUTPUT);
    pinMode(in4_Pin, OUTPUT);

    pinMode(inverterPin, OUTPUT);
    pinMode(fwdPin, OUTPUT);

    pinMode(led_Red, OUTPUT);
    pinMode(led_Blue, OUTPUT);

    // 띠 분리기 핀 설정
    pinMode(labelSwitch, INPUT);
    pinMode(labelSensor, INPUT);
    pinMode(labelMotor, OUTPUT);

    digitalWrite(led_Red, HIGH);
    digitalWrite(led_Blue, HIGH);

    Serial1.println("=== System Initialized ===");
    Serial1.println("*** LOGIN REQUIRED ***");
    Serial1.println("Enter '98' for ADMIN login (speed control enabled)");   // [ADD]
    Serial1.println("Enter '99' for USER login (no real-time speed control)"); // [ADD]
    Serial1.println("Enter 'h' for help");
}

void loadSpeedsFromEEPROM() {
    speed_DO = EEPROM.read(EEPROM_ADDR_DO);
    speed_DC = EEPROM.read(EEPROM_ADDR_DC);
    speed_D1 = EEPROM.read(EEPROM_ADDR_D1);
    speed_D2 = EEPROM.read(EEPROM_ADDR_D2);
    
    // 범위 검증
    if (speed_DO > 255) speed_DO = DEFAULT_SPEED_DO;
    if (speed_DC > 255) speed_DC = DEFAULT_SPEED_DC;
    if (speed_D1 > 255) speed_D1 = DEFAULT_SPEED_D1;
    if (speed_D2 > 255) speed_D2 = DEFAULT_SPEED_D2;
}

void sendCurrentSpeeds() {
    Serial1.print("SPEEDS:DO=");
    Serial1.print(speed_DO);
    Serial1.print(";DC=");
    Serial1.print(speed_DC);
    Serial1.print(";D1=");
    Serial1.print(speed_D1);
    Serial1.print(";D2=");
    Serial1.println(speed_D2);
}

void loop() {
    if(login){
        labelCutter();
    }
    if(labelCutterState==true && !labelOpenTriggered){
        Serial1.println("Door will opened..");
        executeOpenDoor();
        labelOpenTriggered = true;
    }

    // 시리얼 명령 처리
    if (Serial1.available() > 0) {
        String input = Serial1.readString();
        input.trim();

        Serial1.print("Input received: ");
        Serial1.println(input);

        // [MOD] 로그인 분리: 98=ADMIN, 99=USER
        if (input == "98") {
            login = true;
            adminMode = true;
            // 새 세션 시작 시 오류 상태 초기화 (업로드 없이도 정상 복구되게)
            errorState = false;
            Serial1.println("*** ADMIN LOGIN SUCCESSFUL ***");
            Serial1.println("Error state cleared.");
            Serial1.println("Real-time speed control ENABLED.");
            sendCurrentSpeeds();
            Serial1.println("Enter 'h' for available commands");
            return;
        } else if (input == "99") {
            login = true;
            adminMode = false;
            // 새 세션 시작 시 오류 상태 초기화 (업로드 없이도 정상 복구되게)
            errorState = false;
            Serial1.println("*** USER LOGIN SUCCESSFUL ***");
            Serial1.println("Error state cleared.");
            Serial1.println("Real-time speed control DISABLED.");
            Serial1.println("Enter 'h' for available commands");
            return;
        }

        // [MOD] 속도 설정은 관리자만
        if (input.startsWith("SPD:")) {
            if (!adminMode) {
                Serial1.println("*** ACCESS DENIED - Admin required (use 98) ***");
                return;
            }
            parseAndSetSpeeds(input);
            return;
        }

        // [MOD] 속도 조회도 관리자만
        if (input == "Q" || input == "q") {
            if (!adminMode) {
                Serial1.println("*** ACCESS DENIED - Admin required (use 98) ***");
                return;
            }
            sendCurrentSpeeds();
            return;
        }

        // 로그인되지 않은 상태에서는 도움말과 센서 상태만 허용
        if (!login) {
            if (input == "h" || input == "H") {
                showLoginHelp();
            } else if (input == "0") {
                showSensorStatus();
            } else {
                Serial1.println("*** ACCESS DENIED ***");
                Serial1.println("Please login first by entering '98' (admin) or '99' (user)");
                Serial1.println("Available commands without login: 'h' (help), '0' (sensor status)");
            }
            return;
        }

        // 로그인된 상태에서만 실행되는 명령들
        if (input.length() == 1) {
            char command = input.charAt(0);
            switch(command) {
                case '1': executeOpenDoor(); break;
                case '2': executeCloseDoor(); break;
                case '3': executeSensor1Motor(); break;
                case '4': executeSensor2Motor(); break;
                case '5': runAutoSequence(); break;
                case '0': showSensorStatus(); break;
                case 'X':
                case 'x': stopMotor(); break;
                case 'h':
                case 'H': showHelp(); break;
                case 'r':
                case 'R': repairMode(); break;
                case 'L':
                case 'l': logout(); break;
                default: Serial1.println("Invalid command! Enter 'h' for help."); break;
            }
        } else {
            Serial1.println("Invalid command! Enter 'h' for help.");
        }
    }
}

// 공통 오류 트리거: 메시지 출력 후 모든 프로세스 강제 정지
void triggerError(const char* msg) {
    if (errorState) return;
    Serial1.print("ERROR: ");
    Serial1.println(msg);
    // 모든 모터/출력 정지
    stopMotor();
    // 비상 상황: 문이 열린 상태면 안전하게 닫기 시도
    emergencyCloseDoorIfOpen();
    // 오류 상황에서는 인버터까지 완전 차단
    digitalWrite(inverterPin, LOW);
    digitalWrite(fwdPin, LOW);
    Serial1.println("All outputs OFF (inverter disabled) due to error.");
    errorState = true;
}

// 비상 닫기: 손 감지 시 즉시 중단, 제한 시간 내에만 시도
void emergencyCloseDoorIfOpen() {
    // 닫힘 센서가 HIGH면 이미 닫힘 상태
    int closeState = digitalRead(closeDoor_Sensor);
    if (closeState == HIGH) {
        Serial1.println("Emergency: Door already closed.");
        return;
    }

    Serial1.println("Emergency: Attempting to close door...");
    unsigned long startMs = millis();
    const unsigned long timeoutMs = 8000; // 8초 내 시도

    while (digitalRead(closeDoor_Sensor) == LOW) {
        // 손 감지되면 즉시 중단 (문을 열어두어 안전 확보)
        if (digitalRead(handSensor) == HIGH) {
            Serial1.println("ERROR: Hand detected during emergency close; aborting close.");
            break;
        }

        // 닫힘 방향으로 구동
        digitalWrite(in3_Pin, HIGH);
        digitalWrite(in4_Pin, LOW);
        analogWrite(enb_Pin, 120);

        if (millis() - startMs > timeoutMs) {
            Serial1.println("ERROR: Emergency close timeout; door may remain open.");
            break;
        }
        delay(50);
    }

    // 모터 정지
    digitalWrite(in3_Pin, LOW);
    digitalWrite(in4_Pin, LOW);
    analogWrite(enb_Pin, 0);

    if (digitalRead(closeDoor_Sensor) == HIGH) {
        Serial1.println("Emergency: Door closed.");
    }
}

// 로그아웃 기능 추가
void logout() {
    stopMotor();
    login = false;
    adminMode = false; // [ADD]
    // 세션 종료 시 오류 상태 초기화
    errorState = false;
    Serial1.println("*** LOGGED OUT ***");
    Serial1.println("Error state cleared.");
    Serial1.println("All functions are now locked.");
    Serial1.println("Enter '98' (admin) or '99' (user) to login again");
    

}

// 로그인 전 도움말
void showLoginHelp() {
    Serial1.println("=== LOGIN REQUIRED ===");
    Serial1.println("98 - Admin login (real-time speed control)");
    Serial1.println("99 - User login (no real-time speed control)");
    Serial1.println("h  - Show this help");
    Serial1.println("0  - Show sensor status (allowed without login)");
    Serial1.println("======================");
}

// 로그인 후 도움말
void showHelp() {
    Serial1.println("=== Available Commands (Logged In) ===");
    Serial1.println("1  - Open Door");
    Serial1.println("2  - Close Door");
    Serial1.println("3  - Run Sensor1 Motor (24V)");
    Serial1.println("4  - Run Sensor2 Motor (24V)");
    Serial1.println("5  - Run Full Auto Sequence");
    Serial1.println("0  - Show Sensor Status");
    Serial1.println("X  - Stop Motor (Emergency)");
    Serial1.println("L  - Logout");
    Serial1.println("Admin-only: Q (query speeds), SPD:DO=n;DC=n;D1=n;D2=n (set speeds)");
    Serial1.println("=====================================");
}

// =========================
// 띠 분리기 제어 
// =========================
void labelCutter() {
    static int lastSwitchState = LOW;  // 이전 스위치 상태 저장
    static int lastSensorState = HIGH; // 초기값을 HIGH로 잡아 즉시 정지 방지
    static unsigned long motorStartTime = 0;
    const unsigned long sensorIgnoreMs = 700; // 시작 후 짧은 시간 센서 무시
    const unsigned long maxRunMs = 15000; // 15초 타임아웃

    int switchState = digitalRead(labelSwitch);
if (labelCutterState) {
        return;
    }
    // 스위치 상승엣지 감지: 이전 LOW, 현재 HIGH일 때만 1회 실행
    if (switchState == HIGH && lastSwitchState == LOW) {
        motorRunning = true;
        motorStarted = true;
        digitalWrite(labelMotor, HIGH);
        motorStartTime = millis();
        Serial1.println("Label motor started (login required)");
    }

    int currentSensorState = digitalRead(labelSensor);

    // 모터가 시작된 상태에서, 시작 후 지정 시간 경과 후에만 센서 하강엣지로 정지
    if (motorRunning && motorStarted) {
        unsigned long elapsed = millis() - motorStartTime;
        // 일정 시간 경과 후 센서 변화 감지로 정지
        if (elapsed > sensorIgnoreMs) {
            if (lastSensorState == HIGH && currentSensorState == HIGH) {
                motorRunning = false;
                motorStarted = false;
                digitalWrite(labelMotor, LOW);
                Serial1.println("Label cutting done!");
                labelCutterState = true;
            }
        }
        // 최대 15초 넘기면 에러 처리
        if (elapsed > maxRunMs) {
            motorRunning = false;
            motorStarted = false;
            digitalWrite(labelMotor, LOW);
            // 라벨 분리기는 시스템 에러에서 제외: 모터만 정지하고 알림만 출력
            Serial1.println("Label cutter timeout (15s) - label motor stopped (no system error)");
        }
    }

    lastSensorState = currentSensorState;
    lastSwitchState = switchState;  // 마지막에 현재 스위치 상태 저장
}

void showSensorStatus() {
    Serial1.println("=== Current Sensor Status ===");
    
    int seesaw1 = digitalRead(seesaw_Sensor1);
    int seesaw2 = digitalRead(seesaw_Sensor2);
    int doorOpen = digitalRead(openDoor_Sensor);
    int doorClose = digitalRead(closeDoor_Sensor);
    int hand = digitalRead(handSensor);
    
    Serial1.print("Seesaw Sensor1 (Pin 27): ");
    Serial1.println(seesaw1 == HIGH ? "HIGH (Not Detected)" : "LOW (Detected)");
    
    Serial1.print("Seesaw Sensor2 (Pin 28): ");
    Serial1.println(seesaw2 == HIGH ? "HIGH (Not Detected)" : "LOW (Detected)");
    
    Serial1.print("Door Open Sensor (Pin 36): ");
    Serial1.println(doorOpen == HIGH ? "HIGH (Door Open)" : "LOW (Door Closed)");
    
    Serial1.print("Door Close Sensor (Pin 37): ");
    Serial1.println(doorClose == HIGH ? "HIGH (Door Closed)" : "LOW (Door Open)");
    
    Serial1.print("Hand Sensor (Pin 22): ");
    Serial1.println(hand == HIGH ? "HIGH (Hand Detected)" : "LOW (No Hand)");
    
    Serial1.print("Login Status: ");
    Serial1.println(login ? "LOGGED IN" : "NOT LOGGED IN");
    
    Serial1.println("=============================");
}

void runAutoSequence() {
    Serial1.println("Starting full automatic sequence...");
    
    // 단계 1: 문 열기 (knife 작동)
    Serial1.println("=== Auto Step 1: Opening door ===");
    executeOpenDoor();
    if (errorState) { Serial1.println("Auto aborted due to error."); return; }
    
    // 3초 대기
    Serial1.println("Waiting 3 seconds...");
    delay(3000);
    
    // 단계 2: 문 닫기
    Serial1.println("=== Auto Step 2: Closing door ===");
    executeCloseDoor();
    if (errorState) { Serial1.println("Auto aborted due to error."); return; }
    
    // 5초 대기
    Serial1.println("Waiting 5 seconds...");
    delay(2000);
    
    // 단계 3: 센서1 기반 모터
    Serial1.println("=== Auto Step 3: Running motor based on Sensor1 ===");
    executeSensor1Motor();
    if (errorState) { Serial1.println("Auto aborted due to error."); return; }
    
    Serial1.println("Waiting 3 seconds...");
    delay(3000);
    
    //단계 4: 센서2 기반 모터
    Serial1.println("=== Auto Step 4: Running motor based on Sensor2 ===");
    executeSensor2Motor();
    if (errorState) { Serial1.println("Auto aborted due to error."); return; }
    
    // 모든 단계 완료 후 10초 대기 후 종료
    Serial1.println("=== All steps completed ===");
    Serial1.println("Waiting 10 seconds before shutdown...");
    delay(10000);
    
    // 시스템 종료
    Serial1.println("=== System Shutdown ===");
    Serial1.println("All processes completed. System is now idle.");
    Serial1.println("To restart, reset the Arduino or enter new commands.");
    
    Serial1.println("=== Full automatic sequence completed ===");
}

void executeOpenDoor() {
    digitalWrite(inverterPin, HIGH);
    digitalWrite(fwdPin, HIGH);
    Serial1.println("Knife activated!");
    
    door_open_state = digitalRead(openDoor_Sensor);
    Serial1.print("Current door open sensor state: ");
    Serial1.println(door_open_state);
    
    if (door_open_state == LOW){
        Serial1.println("Door is closed. Opening door...");
        unsigned long startMs = millis();
        while(door_open_state == LOW) {
            // 시리얼 명령 처리 (속도 변경)
            checkSerialForSpeedUpdate();
            
            digitalWrite(in3_Pin, LOW);
            digitalWrite(in4_Pin, HIGH);
            analogWrite(enb_Pin, speed_DO); // 매 루프마다 최신 속도 적용
            door_open_state = digitalRead(openDoor_Sensor);
            delay(50); // 100ms -> 50ms로 변경 (더 빠른 반응)
            if (millis() - startMs > 15000) {
                triggerError("Open door timeout (15s)");
                break;
            }
        }
        if (!errorState) {
            Serial1.println("Door opened successfully!");
        }
    } else {
        Serial1.println("Door is already open. No action needed.");
    }

    digitalWrite(in3_Pin, LOW);
    digitalWrite(in4_Pin, LOW);
    analogWrite(enb_Pin, 0);
    Serial1.println("12V Motor stopped.");
    delay(3000);
}

void executeCloseDoor() {
    door_close_state = digitalRead(closeDoor_Sensor);
    
    Serial1.print("Current door close sensor state: ");
    Serial1.println(door_close_state);
    
    if (door_close_state == LOW){
        Serial1.println("Door is open. Closing door...");
        unsigned long startMs = millis();
        while(door_close_state == LOW) {
            // 시리얼 명령 처리 (속도 변경)
            checkSerialForSpeedUpdate();
            
            if(digitalRead(handSensor) == HIGH) {
                Serial1.println("*** HAND DETECTED! Stopping door and reopening ***");
                
                digitalWrite(in3_Pin, LOW);
                digitalWrite(in4_Pin, LOW);
                analogWrite(enb_Pin, 0);
                
                executeOpenDoor();
                delay(3000);
                
                Serial1.println("Waiting for hand to be removed...");
                while(digitalRead(handSensor) == HIGH) {
                    Serial1.println("Hand still detected. Please remove hand.");
                    delay(500);
                }
                
                Serial1.println("Hand removed. Resuming door closing...");
                delay(1000);
                startMs = millis();
            }
            
            digitalWrite(in3_Pin, HIGH);
            digitalWrite(in4_Pin, LOW);
            analogWrite(enb_Pin, speed_DC); // 매 루프마다 최신 속도 적용
            door_close_state = digitalRead(closeDoor_Sensor);
            delay(50); // 100ms -> 50ms로 변경
            if (millis() - startMs > 15000) {
                triggerError("Close door timeout (15s)");
                break;
            }
        }
        if (!errorState) {
            Serial1.println("Door closed successfully!");
        }
    } else {
        Serial1.println("Door is already closed. No action needed.");
    }

    digitalWrite(in3_Pin, LOW);
    digitalWrite(in4_Pin, LOW);
    analogWrite(enb_Pin, 0);
    Serial1.println("Door stopped.");
    // 프론트엔드에서 "Door closed" 문자열을 확실히 수신하도록 보장
    if (digitalRead(closeDoor_Sensor) == HIGH) {
        Serial1.println("Door closed");
    }
}

void executeSensor1Motor() {

    seesaw_State2 = digitalRead(seesaw_Sensor2);
    
    Serial1.print("Current Sensor2 state (used in Motor1): ");
    Serial1.println(seesaw_State2);
    
    for(int i = 0; i < 5; i++){
        digitalWrite(led_Blue, LOW);
        delay(500);
        digitalWrite(led_Blue, HIGH);
        delay(500);
    }
    
    if (seesaw_State2 == HIGH) {
        Serial1.println("Sensor2 is HIGH. Starting 24V motor (direction 1)...");
        unsigned long startMs = millis();
        while (seesaw_State2 == HIGH) {
            // 시리얼 명령 처리 (속도 변경)
            checkSerialForSpeedUpdate();
            
            digitalWrite(in1_Pin, LOW);
            digitalWrite(in2_Pin, HIGH);
            analogWrite(ena_Pin, speed_D1); // 매 루프마다 최신 속도 적용
            
            seesaw_State2 = digitalRead(seesaw_Sensor2);
            delay(50); // 100ms -> 50ms로 변경
            if (millis() - startMs > 15000) {
                triggerError("Motor1 timeout (15s)");
                break;
            }
            digitalWrite(led_Blue, HIGH);
        }
        
        if (!errorState) {
            Serial1.println("Sensor2 became LOW. Motor task completed!");
            Serial1.println("24V Motor stopped.");
        }
    } else {
        Serial1.println("Sensor2 is already LOW. No action needed.");
    }

    digitalWrite(in1_Pin, LOW);
    digitalWrite(in2_Pin, LOW);
    analogWrite(ena_Pin, 0);
}

void executeSensor2Motor() {
    delay(2000);
    seesaw_State1 = digitalRead(seesaw_Sensor1);
    
    Serial1.print("Current Sensor1 state (used in Motor2): ");
    Serial1.println(seesaw_State1);

    if (seesaw_State1 == HIGH) {
        Serial1.println("Sensor1 is HIGH. Starting 24V motor (direction 2)...");

        unsigned long startMs = millis();
        while (seesaw_State1 == HIGH) {
            // 시리얼 명령 처리 (속도 변경)
            checkSerialForSpeedUpdate();
            
            digitalWrite(in1_Pin, HIGH);
            digitalWrite(in2_Pin, LOW);
            analogWrite(ena_Pin, speed_D2); // 매 루프마다 최신 속도 적용

            seesaw_State1 = digitalRead(seesaw_Sensor1);
            delay(50); // 100ms -> 50ms로 변경
            if (millis() - startMs > 15000) {
                triggerError("Motor2 timeout (15s)");
                break;
            }
        }
        if (!errorState) {
            Serial1.println("Sensor1 became LOW. Motor task completed!");
        }
    } else {
        Serial1.println("Sensor1 is already LOW. No action needed.");
    }

    digitalWrite(in1_Pin, LOW);
    digitalWrite(in2_Pin, LOW);
    analogWrite(ena_Pin, 0);
    delay(5000);
    labelCutterState = false;
    labelOpenTriggered = false;
    if (!errorState) {
        Serial1.println("24V Motor stopped.");
    }
}

// 새로운 함수: while 루프 안에서 속도 업데이트 확인
void checkSerialForSpeedUpdate() {
    while (Serial1.available() > 0) {
        int c = Serial1.peek();
        if (c == '\n' || c == '\r') { Serial1.read(); continue; }

        // 즉시 정지/로그아웃 (버퍼 소비 후 처리)
        if (c == 'x' || c == 'X') { Serial1.read(); stopMotor(); return; }
        if (c == 'l' || c == 'L') { Serial1.read(); logout();   return; }

        // 관리자만 속도 관련 허용
        if (c == 'S') {
            String line = Serial1.readStringUntil('\n');
            line.trim();
            if (line.startsWith("SPD:")) {
                if (login && adminMode) parseAndSetSpeeds(line);
                else Serial1.println("*** ACCESS DENIED - Admin required for SPD ***");
            }
            continue;
        }
        if (c == 'Q' || c == 'q') {
            Serial1.read();
            if (login && adminMode) sendCurrentSpeeds();
            else Serial1.println("*** ACCESS DENIED - Admin required for Q ***");
            continue;
        }

        // 그 외 명령은 메인 루프에서 처리하도록 남겨둠
        break;
    }
}

void parseAndSetSpeeds(String cmd) {
    // SPD:DO=255;DC=120;D1=70;D2=90 형식 파싱
    bool changed = false;
    int newDO = speed_DO, newDC = speed_DC, newD1 = speed_D1, newD2 = speed_D2;
    
    // DO 파싱
    int doIdx = cmd.indexOf("DO=");
    if (doIdx != -1) {
        int endIdx = cmd.indexOf(';', doIdx);
        if (endIdx == -1) endIdx = cmd.length();
        String val = cmd.substring(doIdx + 3, endIdx);
        newDO = constrain(val.toInt(), 0, 255);
        if (newDO != speed_DO) changed = true;
    }
    
    // DC 파싱
    int dcIdx = cmd.indexOf("DC=");
    if (dcIdx != -1) {
        int endIdx = cmd.indexOf(';', dcIdx);
        if (endIdx == -1) endIdx = cmd.length();
        String val = cmd.substring(dcIdx + 3, endIdx);
        newDC = constrain(val.toInt(), 0, 255);
        if (newDC != speed_DC) changed = true;
    }
    
    // D1 파싱
    int d1Idx = cmd.indexOf("D1=");
    if (d1Idx != -1) {
        int endIdx = cmd.indexOf(';', d1Idx);
        if (endIdx == -1) endIdx = cmd.length();
        String val = cmd.substring(d1Idx + 3, endIdx);
        newD1 = constrain(val.toInt(), 0, 255);
        if (newD1 != speed_D1) changed = true;
    }
    
    // D2 파싱
    int d2Idx = cmd.indexOf("D2=");
    if (d2Idx != -1) {
        int endIdx = cmd.indexOf(';', d2Idx);
        if (endIdx == -1) endIdx = cmd.length();
        String val = cmd.substring(d2Idx + 3, endIdx);
        newD2 = constrain(val.toInt(), 0, 255);
        if (newD2 != speed_D2) changed = true;
    }
    
    // 값이 변경된 경우에만 EEPROM 업데이트 (쓰기 횟수 절약)
    if (changed) {
        speed_DO = newDO;
        speed_DC = newDC;
        speed_D1 = newD1;
        speed_D2 = newD2;
        
        EEPROM.update(EEPROM_ADDR_DO, speed_DO);
        EEPROM.update(EEPROM_ADDR_DC, speed_DC);
        EEPROM.update(EEPROM_ADDR_D1, speed_D1);
        EEPROM.update(EEPROM_ADDR_D2, speed_D2);
        
        Serial1.print("Speed updated and saved: DO=");
        Serial1.print(speed_DO);
        Serial1.print(" DC=");
        Serial1.print(speed_DC);
        Serial1.print(" D1=");
        Serial1.print(speed_D1);
        Serial1.print(" D2=");
        Serial1.println(speed_D2);
    } else {
        Serial1.println("No speed change detected");
    }
}
void stopMotor(){
    // 모션 정지: 정상(X) 정지 시에는 인버터는 유지하고 FWD만 해제
    digitalWrite(fwdPin, LOW);
    //digitalWrite(inverterPin, LOW);
    // 12V 모터 정지
    digitalWrite(in3_Pin, LOW);
    digitalWrite(in4_Pin, LOW);
    analogWrite(enb_Pin, 0);
    // 24V 모터 정지
    digitalWrite(in1_Pin, LOW);
    digitalWrite(in2_Pin, LOW);
    analogWrite(ena_Pin, 0);
    Serial1.println("Motor stopped.");
    login = false;  // 로그인 상태를 false로 변경
        // Allow next label cycle
    labelCutterState = false;
    labelOpenTriggered = false;
    Serial1.println("Knife deactivated.");
    // 비상정지 후에는 에러 상태를 해제하여 다음 세션에서 오작동을 막음
    errorState = false;
    Serial1.println("Error state cleared.");
    Serial1.println("*** LOGGED OUT BY EMERGENCY STOP ***");
    Serial1.println("Enter '99' to login again");
}

void repairMode(){
    // seesaw sensor 1,2 모두 HIGH 상태일 때, 복구 모드
    seesaw_State1 = digitalRead(seesaw_Sensor1);
    seesaw_State2 = digitalRead(seesaw_Sensor2);
    inverter_State = digitalRead(inverterPin);
    
    if(seesaw_State1 == HIGH && seesaw_State2 == HIGH){
        // inverter 상태 확인 후 fwd 신호까지 보내서 끼임 제거
        if(inverter_State == HIGH) {
            digitalWrite(fwdPin, HIGH);
            Serial1.println("Repair mode activated: Inverter and FWD ON to clear jam.");
        } else if(inverter_State == LOW){
            digitalWrite(inverterPin, HIGH);
            digitalWrite(fwdPin, HIGH);
            Serial1.println("Repair mode activated: Inverter ON and FWD ON to clear jam.");
        }
        
        // 시소 복구 시퀀스 시작
        unsigned long totalStartMs = millis();
        bool repairSuccess = false;
        int attemptCount = 0;
        const int maxAttempts = 10; // 최대 10회 시도
        
        while(!repairSuccess && attemptCount < maxAttempts && (millis() - totalStartMs < 60000)){
            attemptCount++;
            Serial1.print("Repair attempt #");
            Serial1.println(attemptCount);
            
            // 1단계: 시소를 내려서 sensor2가 LOW가 될 때까지 대기
            Serial1.println("Step 1: Lowering seesaw until sensor2 is LOW");
            unsigned long startMs = millis();
            seesaw_State2 = digitalRead(seesaw_Sensor2);
            
            while(seesaw_State2 == HIGH && (millis() - startMs < 5000)){
                seesaw_State2 = digitalRead(seesaw_Sensor2);
                digitalWrite(in1_Pin, LOW);
                digitalWrite(in2_Pin, HIGH);
                analogWrite(ena_Pin, speed_D1);
                delay(50);
            }
            
            // Timeout 발생 시 다시 올리기
            if(seesaw_State2 == HIGH){
                Serial1.println("Timeout: sensor2 still HIGH, raising seesaw again");
                startMs = millis();
                
                while((millis() - startMs < 5000)){
                    digitalWrite(in1_Pin, HIGH);
                    digitalWrite(in2_Pin, LOW);
                    analogWrite(ena_Pin, speed_D1);
                    delay(50);
                }
                
                // 모터 잠깐 정지
                digitalWrite(in1_Pin, LOW);
                digitalWrite(in2_Pin, LOW);
                delay(500);
                
                continue; // 다음 시도로
            }
            
            // 2단계: sensor2가 LOW가 되면 시소를 올려서 sensor1이 LOW가 될 때까지
            if(seesaw_State2 == LOW){
                Serial1.println("Step 2: Sensor2 LOW detected, raising seesaw until sensor1 is LOW");
                startMs = millis();
                seesaw_State1 = digitalRead(seesaw_Sensor1);
                
                while(seesaw_State1 == HIGH && (millis() - startMs < 5000)){
                    seesaw_State1 = digitalRead(seesaw_Sensor1);
                    digitalWrite(in1_Pin, HIGH);
                    digitalWrite(in2_Pin, LOW);
                    analogWrite(ena_Pin, speed_D1);
                    delay(50);
                }
                
                if(seesaw_State1 == LOW){
                    repairSuccess = true;
                    Serial1.println("Seesaw repair sequence completed successfully.");
                    break;
                } else {
                    Serial1.println("Timeout: sensor1 still HIGH, retrying");
                    delay(500);
                }
            }
        }
        
        // 모터 정지
        digitalWrite(in1_Pin, LOW);
        digitalWrite(in2_Pin, LOW);
        analogWrite(ena_Pin, 0);
        
        // 복구 성공 시 인버터 3초 더 돌리기
        if(repairSuccess){
            Serial1.println("Running inverter for 3 more seconds to complete jam clearance...");
            delay(3000);
            
            // FWD 및 Inverter 신호 종료
            digitalWrite(fwdPin, LOW);
            if(inverter_State == LOW){
                digitalWrite(inverterPin, LOW);
            }
            
            Serial1.println("Repair mode completed successfully. System restored to normal operation.");
        } else {
            // 복구 실패 시 에러 처리
            Serial1.println("ERROR: Repair mode failed after maximum attempts or timeout.");
            Serial1.print("Total attempts: ");
            Serial1.println(attemptCount);
            
            // FWD 및 Inverter 신호 종료
            digitalWrite(fwdPin, LOW);
            if(inverter_State == LOW){
                digitalWrite(inverterPin, LOW);
            }
        }
    }
}