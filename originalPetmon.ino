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

// 24V DC MOTOR PIN
int ena_Pin = 6; 
int in1_Pin = 7;
int in2_Pin = 8;

// 12V DC MOTOR PIN
int enb_Pin = 11;
int in4_Pin = 10;
int in3_Pin = 9;

// LED PIN
int led_Red = 46;
int led_Blue = 47;

bool motorRunning = false;
bool switchPressed = false;
bool motorStarted = false;
int lastSensorState = HIGH;
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

    pinMode(led_Red, OUTPUT);
    pinMode(led_Blue, OUTPUT);

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
    

    if (Serial1.available() > 0) {
        String input = Serial1.readStringUntil('\n');
        input.trim();

        Serial1.print("Input received: ");
        Serial1.println(input);

        // 로그인 명령 우선 처리
        if (input == "98") {
            login = true;
            adminMode = true;
            Serial1.println("*** ADMIN LOGIN SUCCESSFUL ***");
            Serial1.println("Real-time speed control ENABLED.");
            sendCurrentSpeeds();
            Serial1.println("Enter 'h' for available commands");
            return;
        } else if (input == "99") {
            login = true;
            adminMode = false;
            Serial1.println("*** USER LOGIN SUCCESSFUL ***");
            Serial1.println("Real-time speed control DISABLED.");
            Serial1.println("Enter 'h' for available commands");
            return;
        }

        // [핵심] 로그인 여부와 무관하게 X/L 즉시 처리
        if (input.length() == 1) {
            char c = input.charAt(0);
            if (c == 'X' || c == 'x') { stopMotor(); return; }
            if (c == 'L' || c == 'l') { logout();   return; }
        }

        // 관리자 전용 기능
        if (input.startsWith("SPD:")) {
            if (!adminMode) {
                Serial1.println("*** ACCESS DENIED - Admin required (use 98) ***");
                return;
            }
            parseAndSetSpeeds(input);
            return;
        }
        if (input == "Q" || input == "q") {
            if (!adminMode) {
                Serial1.println("*** ACCESS DENIED - Admin required (use 98) ***");
                return;
            }
            sendCurrentSpeeds();
            return;
        }

        // 로그인 전 허용 명령
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

        // 로그인 후 일반 명령
        if (input.length() == 1) {
            char command = input.charAt(0);
            switch(command) {
                case '1': executeOpenDoor(); break;
                case '2': executeCloseDoor(); break;
                case '3': executeSensor1Motor(); break;
                case '4': executeSensor2Motor(); break;
                case '5': runAutoSequence(); break;
                case '0': showSensorStatus(); break;
                case 'h':
                case 'H': showHelp(); break;
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
    Serial1.println("All outputs OFF due to error.");
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
    Serial1.println("*** LOGGED OUT ***");
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
    door_open_state = digitalRead(openDoor_Sensor);
    Serial1.print("Current door open sensor state: ");
    Serial1.println(door_open_state);
    
    if (door_open_state == LOW){
        Serial1.println("Door is closed. Opening door...");
        unsigned long startMs = millis();
        while(door_open_state == LOW) {
            // 시리얼 명령 처리 (속도 변경)
            checkSerial1ForSpeedUpdate();
            
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
            checkSerial1ForSpeedUpdate();
            
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
            checkSerial1ForSpeedUpdate();
            
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
        }
    } else {
        Serial1.println("Sensor2 is already LOW. No action needed.");
    }

    digitalWrite(in1_Pin, LOW);
    digitalWrite(in2_Pin, LOW);
    analogWrite(ena_Pin, 0);
    Serial1.println("24V Motor stopped.");
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
            checkSerial1ForSpeedUpdate();
            
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
    Serial1.println("24V Motor stopped.");
    delay(5000);
}

// 새로운 함수: while 루프 안에서 속도 업데이트 확인
void checkSerial1ForSpeedUpdate() {
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
    Serial1.println("Knife deactivated.");
    Serial1.println("*** LOGGED OUT BY EMERGENCY STOP ***");
    Serial1.println("Enter '99' to login again");
}