/**
 * PETMON Firmware Refactored
 * Version: 2.0 (Refactored from 1.2)
 * 
 * Target: Arduino Mega / Standard Arduino Environment
 * Description: Modular Object-Oriented Firmware for PetMon Machine
 */
/**
 * PETMON Firmware Refactored
 * Version: 2.0 (Refactored from 1.2)
 * 
 * Target: Arduino Mega / Standard Arduino Environment
 * Description: Modular Object-Oriented Firmware for PetMon Machine
 */

/*
 * Copyright (c) 2026 (주)리한 (ReHAN Co. LTD.)
 * All rights reserved.
 *
 * 이 소프트웨어와 관련 문서의 저작권은 (주)리한에 있으며,
 * 저작권자의 서면 동의 없이 무단으로 복제, 배포, 수정, 전송할 수 없습니다.
 * 
 * This software is the confidential and proprietary information of [ReHAN Co. LTD.].
 * You shall not disclose such Confidential Information and shall use it only in
 * accordance with the terms of the license agreement you entered into with [ReHAN Co. LTD.].
 */
#include <Arduino.h>
#include <EEPROM.h>

// =========================================================
// 1. 구성 설정 및 상수
// =========================================================

namespace Pin {
    // 24V DC Motor (AI_ZONE)
    constexpr int MOTOR_24V_ENA = 6;
    constexpr int MOTOR_24V_IN1 = 7;
    constexpr int MOTOR_24V_IN2 = 8;

    // 12V DC Motor (Door)
    constexpr int MOTOR_12V_ENB = 11;
    constexpr int MOTOR_12V_IN3 = 9;
    constexpr int MOTOR_12V_IN4 = 10;

    // Inverter (MC12B, FA-50)
    constexpr int INVERTER_ENABLE = 50;
    constexpr int INVERTER_FWD    = 40;
    constexpr int INVERTER_REV    = 39;

    // Belt Cutter (띠 분리기)
    constexpr int BELT_SWITCH = 24;
    constexpr int BELT_SENSOR = 25;
    constexpr int BELT_MOTOR  = 48;

    // AI-ZONE Sensors
    constexpr int SENSOR_AI_ZONE_1  = 27;
    constexpr int SENSOR_AI_ZONE_2  = 28;
    constexpr int SENSOR_DOOR_OPEN = 37;
    constexpr int SENSOR_DOOR_CLOSE= 36;
    constexpr int SENSOR_HAND      = 22;

    // LEDs
    constexpr int LED_RED  = 46;
    constexpr int LED_BLUE = 47;
}

namespace EEPROM_Addr {
    constexpr int SPEED_DO = 0;   // Door Open
    constexpr int SPEED_DC = 1;   // Door Close
    constexpr int SPEED_D1 = 2;   // AI_ZONE Dir 1
    constexpr int SPEED_D2 = 3;   // AI_ZONE Dir 2
    constexpr int MAGIC    = 4;   // Magic Number
}

namespace Defaults {
    constexpr int SPEED_DO = 255;
    constexpr int SPEED_DC = 120;
    constexpr int SPEED_D1 = 70;
    constexpr int SPEED_D2 = 90;
    constexpr int MAGIC_VAL = 0xAB;
}

// =========================================================
// 2. 전역 시스템 상태 및 제어 컨텍스트
// =========================================================
struct SystemState {
    bool isLoggedIn = false;
    bool isAdmin = false;
    bool isError = false;
    bool isReverseMode = false;
    
    // Motor Speeds
    int speed_DO = Defaults::SPEED_DO;
    int speed_DC = Defaults::SPEED_DC;
    int speed_D1 = Defaults::SPEED_D1;
    int speed_D2 = Defaults::SPEED_D2;

    // Logic Flags
    bool BELTCutterDone = false;
    bool BELTOpenTriggered = false;
    bool BELTManualTrigger = false;
};

SystemState sys; // 전역 인스턴스

// 클래스에서 사용하기 위한 전역 함수 선언
void globalStop(); 
void globalCheckSerial(); // 루프 탈출용 전역 시리얼 체크 함수

// =========================================================
// 3. 하드웨어 추상화
// =========================================================

// =========================================================
// 속도 설정 관리 클래스 (EEPROM 기반 영구 저장)
// =========================================================
class SpeedManager {
public:
    // -----------------------------------------------------
    // 초기화
    // - EEPROM에 유효한 데이터가 없으면 기본값 저장
    // - 이후 EEPROM 값 로드
    // -----------------------------------------------------
    static void init() {
        // 매직 값 확인 (초기화 여부 판단)
        if (EEPROM.read(EEPROM_Addr::MAGIC) != Defaults::MAGIC_VAL) {
            // 기본 속도 값 저장
            save(Defaults::SPEED_DO, Defaults::SPEED_DC, Defaults::SPEED_D1, Defaults::SPEED_D2);
            EEPROM.write(EEPROM_Addr::MAGIC, Defaults::MAGIC_VAL);
        }
        load();
    }

    // -----------------------------------------------------
    // EEPROM에 저장된 속도 값 로드
    // - 값 범위 보호 (0~255)
    // -----------------------------------------------------
    static void load() {
        sys.speed_DO = constrain(EEPROM.read(EEPROM_Addr::SPEED_DO), 0, 255);
        sys.speed_DC = constrain(EEPROM.read(EEPROM_Addr::SPEED_DC), 0, 255);
        sys.speed_D1 = constrain(EEPROM.read(EEPROM_Addr::SPEED_D1), 0, 255);
        sys.speed_D2 = constrain(EEPROM.read(EEPROM_Addr::SPEED_D2), 0, 255);
    }

    // -----------------------------------------------------
    // 속도 값 저장
    // - 변경된 값만 EEPROM에 기록 (수명 보호)
    // - 변경 여부에 따라 결과 출력
    // -----------------------------------------------------
    static void save(int do_s, int dc_s, int d1_s, int d2_s) {
        bool changed = false;

        // DO 모터 속도
        if (do_s != sys.speed_DO) {
            EEPROM.update(EEPROM_Addr::SPEED_DO, do_s);
            sys.speed_DO = do_s;
            changed = true;
        }

        // DC 모터 속도
        if (dc_s != sys.speed_DC) {
            EEPROM.update(EEPROM_Addr::SPEED_DC, dc_s);
            sys.speed_DC = dc_s;
            changed = true;
        }

        // D1 모터 속도
        if (d1_s != sys.speed_D1) {
            EEPROM.update(EEPROM_Addr::SPEED_D1, d1_s);
            sys.speed_D1 = d1_s;
            changed = true;
        }

        // D2 모터 속도
        if (d2_s != sys.speed_D2) {
            EEPROM.update(EEPROM_Addr::SPEED_D2, d2_s);
            sys.speed_D2 = d2_s;
            changed = true;
        }
        
        // 변경 결과 출력
        if (changed) {
            printSpeeds();
        } else {
            Serial1.println("No speed change detected");
        }
    }

    // -----------------------------------------------------
    // 현재 속도 값 시리얼 출력
    // -----------------------------------------------------
    static void printSpeeds() {
        Serial1.print("SPEEDS:DO="); Serial1.print(sys.speed_DO);
        Serial1.print(";DC="); Serial1.print(sys.speed_DC);
        Serial1.print(";D1="); Serial1.print(sys.speed_D1);
        Serial1.print(";D2="); Serial1.println(sys.speed_D2);
    }
};

// =========================================================
// 모터 드라이버 추상화 클래스
// - 방향 제어 및 속도 제어(PWM)
// =========================================================
class MotorDriver {
private:
    int pinEn;   // PWM 속도 제어 핀
    int pinIn1;  // 방향 제어 핀 1
    int pinIn2;  // 방향 제어 핀 2

public:
    // -----------------------------------------------------
    // 생성자
    // - 모터 드라이버 핀 설정
    // -----------------------------------------------------
    MotorDriver(int en, int in1, int in2)
        : pinEn(en), pinIn1(in1), pinIn2(in2) {}

    // -----------------------------------------------------
    // 초기화
    // - 핀 모드 설정
    // - 초기 상태 정지
    // -----------------------------------------------------
    void init() {
        pinMode(pinEn, OUTPUT);
        pinMode(pinIn1, OUTPUT);
        pinMode(pinIn2, OUTPUT);
        stop();
    }

    // -----------------------------------------------------
    // 정방향 회전
    // -----------------------------------------------------
    void runForward(int speed) {
        digitalWrite(pinIn1, HIGH);
        digitalWrite(pinIn2, LOW);
        analogWrite(pinEn, speed);
    }

    // -----------------------------------------------------
    // 역방향 회전
    // -----------------------------------------------------
    void runBackward(int speed) {
        digitalWrite(pinIn1, LOW);
        digitalWrite(pinIn2, HIGH);
        analogWrite(pinEn, speed);
    }

    // -----------------------------------------------------
    // 모터 정지
    // -----------------------------------------------------
    void stop() {
        digitalWrite(pinIn1, LOW);
        digitalWrite(pinIn2, LOW);
        analogWrite(pinEn, 0);
    }
    
    // -----------------------------------------------------
    // 페트몬 전용 동작 (12V 모터 배선 기준)
    // - 기존 로직과 호환성 유지
    // -----------------------------------------------------

    // 문 열림 동작
    // 기존 executeOpenDoor() (LOW, HIGH)
    void runSpecialOpen(int speed) {
        digitalWrite(pinIn1, LOW); 
        digitalWrite(pinIn2, HIGH);
        analogWrite(pinEn, speed);
    }

    // 문 닫힘 동작
    // 기존 executeCloseDoor() HIGH, LOW)
    void runSpecialClose(int speed) {
        digitalWrite(pinIn1, HIGH);
        digitalWrite(pinIn2, LOW);
        analogWrite(pinEn, speed);
    }
};

// =========================================================
// 인버터 제어 클래스 (MC12B, FA-50)
// - Enable / Forward / Reverse 모드 제어
// =========================================================
class InverterController {
public:
    // -----------------------------------------------------
    // 초기화
    // - 인버터 제어 핀 설정
    // -----------------------------------------------------
    static void init() {
        pinMode(Pin::INVERTER_ENABLE, OUTPUT);
        pinMode(Pin::INVERTER_FWD, OUTPUT);
        pinMode(Pin::INVERTER_REV, OUTPUT);
    }

    // -----------------------------------------------------
    // 인버터 전원 제어
    // -----------------------------------------------------
    static void enable() {
        digitalWrite(Pin::INVERTER_ENABLE, HIGH);
    }

    static void disable() {
        digitalWrite(Pin::INVERTER_ENABLE, LOW);
        Serial1.println("MC12B OFF");
    }

    static void on() {
        digitalWrite(Pin::INVERTER_ENABLE, HIGH);
        Serial1.println("MC12B ON");
    }

    // -----------------------------------------------------
    // 정방향(FWD) 출력 제어
    // - 역회전에서는 회전 반전 적용
    // -----------------------------------------------------
    static void setFwd(bool state) {
        if (state) {
            // ON 요청 시: 역회전 모드 여부에 따라 논리 반전
            digitalWrite(
                Pin::INVERTER_FWD,
                sys.isReverseMode ? LOW : HIGH
            );
        } else {
            // OFF 요청
            digitalWrite(Pin::INVERTER_FWD, LOW);
        }
    }

    // -----------------------------------------------------
    // 역회전 모드 설정
    // - FWD 출력 반전
    // - REV 핀으로 모드 상태 표시
    // -----------------------------------------------------
    static void setRevMode(bool active) {
        sys.isReverseMode = active;
        digitalWrite(Pin::INVERTER_REV, active ? HIGH : LOW);
        
        if (active) {
            Serial1.println("Reverse mode ACTIVATED. FWD logic is now inverted (LOW = ON).");
            // 역회전 진입 시 즉시 동작하도록 FWD LOW 설정
            digitalWrite(Pin::INVERTER_FWD, LOW);
            Serial1.println("FWD pin set to LOW to start motor in reverse mode.");
        } else {
            Serial1.println("Reverse mode DEACTIVATED. FWD logic restored (HIGH = ON).");
            // 모드 해제 시 정지
            digitalWrite(Pin::INVERTER_FWD, LOW);
        }
    }

    // -----------------------------------------------------
    // 인버터 정지
    // - 모든 출력 제거
    // - 역회전 강제 해제
    // -----------------------------------------------------
    static void stop() {
        // 정방향 출력 OFF
        digitalWrite(Pin::INVERTER_FWD, LOW);

        // 역회전 모드가 활성화되어 있으면 해제
        if (sys.isReverseMode) {
            sys.isReverseMode = false;
            digitalWrite(Pin::INVERTER_REV, LOW);
            Serial1.println("Reverse mode DEACTIVATED by stop command.");
        }
    }
};

// =========================================================
// 센서 입력 추상화 클래스
// - 디지털 센서 상태 판별 및 디버그 출력
// =========================================================
class Sensors {
public:
    // -----------------------------------------------------
    // 초기화
    // - 모든 센서 핀 입력 모드 설정
    // -----------------------------------------------------
    static void init() {
        pinMode(Pin::SENSOR_AI_ZONE_1, INPUT);
        pinMode(Pin::SENSOR_AI_ZONE_2, INPUT);
        pinMode(Pin::SENSOR_DOOR_OPEN, INPUT);
        pinMode(Pin::SENSOR_DOOR_CLOSE, INPUT);
        pinMode(Pin::SENSOR_HAND, INPUT);
        pinMode(Pin::BELT_SWITCH, INPUT);
        pinMode(Pin::BELT_SENSOR, INPUT);
    }
    // -----------------------------------------------------
    // AI 감지 영역 센서
    // - LOW : 감지됨
    // - HIGH: 미감지
    // -----------------------------------------------------
    static bool isAI_ZONE1Detected() { return digitalRead(Pin::SENSOR_AI_ZONE_1) == LOW; }
    static bool isAI_ZONE2Detected() { return digitalRead(Pin::SENSOR_AI_ZONE_2) == LOW; } 
    // -----------------------------------------------------
    // 투입구 위치 센서
    // -----------------------------------------------------
    static bool isDoorOpen() { return digitalRead(Pin::SENSOR_DOOR_OPEN) == HIGH; } 

    static bool isDoorOpenLimitReached() { return digitalRead(Pin::SENSOR_DOOR_OPEN) == HIGH; }
    static bool isDoorClosedLimitReached() { return digitalRead(Pin::SENSOR_DOOR_CLOSE) == HIGH; }
    
    // -----------------------------------------------------
    // 손 감지 센서
    // -----------------------------------------------------
    static bool isHandDetected() { return digitalRead(Pin::SENSOR_HAND) == HIGH; }

    // -----------------------------------------------------
    // 센서 상태 (시리얼 디버그)
    // -----------------------------------------------------
    static void report() {
        Serial1.println("=== Current Sensor Status ===");
        Serial1.print("AI_ZONE Sensor1 (Pin 27): "); Serial1.println(digitalRead(Pin::SENSOR_AI_ZONE_1) == HIGH ? "HIGH (Not Detected)" : "LOW (Detected)");
        Serial1.print("AI_ZONE Sensor2 (Pin 28): "); Serial1.println(digitalRead(Pin::SENSOR_AI_ZONE_2) == HIGH ? "HIGH (Not Detected)" : "LOW (Detected)");
        Serial1.print("Door Open Sensor (Pin 37): "); Serial1.println(digitalRead(Pin::SENSOR_DOOR_OPEN) == HIGH ? "HIGH (Door Open)" : "LOW (Door Closed)");
        Serial1.print("Door Close Sensor (Pin 36): "); Serial1.println(digitalRead(Pin::SENSOR_DOOR_CLOSE) == HIGH ? "HIGH (Door Closed)" : "LOW (Door Open)");
        Serial1.print("Hand Sensor (Pin 22): "); Serial1.println(digitalRead(Pin::SENSOR_HAND) == HIGH ? "HIGH (Hand Detected)" : "LOW (No Hand)");
        Serial1.print("Belt Senser (Pin 25): "); Serial1.println(digitalRead(Pin::BELT_SENSOR) == HIGH ? "HIGH (Abnormal)" : "LOW (Normal)");
        Serial1.print("Login Status: "); Serial1.println(sys.isLoggedIn ? "LOGGED IN" : "NOT LOGGED IN");
        Serial1.println("=============================");
    }
};
// =========================================================
// LED 제어
// =========================================================
class LED {
public:
    static void init() {
        pinMode(Pin::LED_RED, OUTPUT);
        pinMode(Pin::LED_BLUE, OUTPUT);
        digitalWrite(Pin::LED_RED, HIGH);
        digitalWrite(Pin::LED_BLUE, HIGH);
    }
    static void blinkBlue() {
        for(int i = 0; i < 5; i++) {
            digitalWrite(Pin::LED_BLUE, LOW); delay(300);
            digitalWrite(Pin::LED_BLUE, HIGH); delay(300);
        }
        Serial1.println("led blink success");
    }
};

// =========================================================
// 기능 모듈
// =========================================================

// ---------------------------------------------------------
// 모터
// ---------------------------------------------------------
MotorDriver motor24V(Pin::MOTOR_24V_ENA, Pin::MOTOR_24V_IN1, Pin::MOTOR_24V_IN2);
MotorDriver motor12V(Pin::MOTOR_12V_ENB, Pin::MOTOR_12V_IN3, Pin::MOTOR_12V_IN4);


// =========================================================
//   띠 분리기 제어
// - 페트병 투입 감지 기반 자동 동작
// - 수동 / 재시도 / 타임아웃 처리
// =========================================================
class BELTCutterManager {
    // -----------------------------------------------------
    // 내부 상태 변수
    // -----------------------------------------------------
    bool isRunning = false; // 모터 동작 여부
    bool motorStarted = false; // 모터 시작
    unsigned long startMs = 0; // 동작 시작 시간
    bool sensorDetached = false; // 띠 분리 감지
    bool hasRetried = false; // 재시도 여부
    int lastSwitchState = LOW; // 이전 스위치 상태
    int lastSensorState = HIGH; // 이전 센서 상태

    // -----------------------------------------------------
    // 타이머 상수
    // -----------------------------------------------------
    const unsigned long SENSOR_IGNORE_MS = 700; // 초기 센서 무시 시간
    const unsigned long MAX_RUN_MS = 15000; // 최대 동작 시간
    const unsigned long RETRY_MS = 3000; // 재시도 대기 시간

public:
    // -----------------------------------------------------
    // 초기화
    // -----------------------------------------------------
    void init() {
        pinMode(Pin::BELT_MOTOR, OUTPUT);
        digitalWrite(Pin::BELT_MOTOR, LOW);
    }
    // -----------------------------------------------------
    // 주기적 업데이트 (메인 루프에서 호출)
    // -----------------------------------------------------
    void update() {
        // 로그인 상태가 아니면 동작 안하도록 설정
        if (!sys.isLoggedIn) return;
        
        // 완료 후 실행 중이 아니면 무시
        if (sys.BELTCutterDone && !isRunning) return;

        int switchState = digitalRead(Pin::BELT_SWITCH);
        int currentSensorState = digitalRead(Pin::BELT_SENSOR);

        // 스위치 상승 엣지 감지 (페트병 투입)
        if (switchState == HIGH && lastSwitchState == LOW && !isRunning) {
            startMotor();
        }
        // 동작 중일 경우 런타임 처리
        if (isRunning) processRunLogic(currentSensorState);
        // 상태 갱신
        lastSwitchState = switchState;
        lastSensorState = currentSensorState;
    }

    // -----------------------------------------------------
    // 띠 분리기 수동 트리거
    // -----------------------------------------------------
    void manualTrigger() {
        if (!sys.isLoggedIn || isRunning) {
            Serial1.println(isRunning ? "Already running." : "Login required.");
            return;
        }
        // 수동 동작 플래그 설정
        sys.BELTManualTrigger = true;
        sys.BELTCutterDone = false;
        sys.BELTOpenTriggered = false;
        Serial1.println("BELT motor started by command 'c'");
        
        runBlockingCycle();
    }
    
    // -----------------------------------------------------
    // 띠 분리기 재시도 트리거
    // -----------------------------------------------------
    void retryTrigger() {
        if (!sys.isLoggedIn || isRunning) return;
        // 상태 초기화 
        sys.BELTCutterDone = false;
        sys.BELTOpenTriggered = false; // 투입구 안열리도록 제어
        sys.BELTManualTrigger = true;  // 수동 제어 플래그
        
        Serial1.println("BELT cutter retry - waiting for switch press");
        
        // 스위치 입력 대기
        int localLastSwitch = LOW;
        while(true) {
             int sw = digitalRead(Pin::BELT_SWITCH);
             if (sw == LOW && localLastSwitch == HIGH) { // 상승 엣지
                 break;
             }
             localLastSwitch = sw;
             delay(10);
        }
        
        Serial1.println("BELT motor started (switch)");
        runBlockingCycle();
    }
    // -----------------------------------------------------
    // 띠 분리기 동작 사이클
    // -----------------------------------------------------
    void runBlockingCycle() {
        digitalWrite(Pin::BELT_MOTOR, HIGH);
        unsigned long mStart = millis();
        int lastSens = digitalRead(Pin::BELT_SENSOR);
        bool detached = false;
        motorStarted = true;
        isRunning = true; // 전역 상태 체크

        while(true) {
            int curSens = digitalRead(Pin::BELT_SENSOR);
            unsigned long elap = millis() - mStart;
            // 초기 센서 안정화 시간 이후 적용
            if (elap > SENSOR_IGNORE_MS) {
                if (curSens == LOW) detached = true;    
                // 띠 분리 완료 감지
                if (detached && lastSens == LOW && curSens == HIGH) {
                    digitalWrite(Pin::BELT_MOTOR, LOW);
                    Serial1.println("BELT cutting done - cycle complete");
                    // 자동 / 수동 동작 완료 구분 플래그
                    if (sys.BELTManualTrigger) sys.BELTCutterDone = false; 
                    else sys.BELTCutterDone = true;
                    break;
                }
            }
            // 최대 동작 시간 초과 시 타임아웃
            if (elap > MAX_RUN_MS) {
                digitalWrite(Pin::BELT_MOTOR, LOW);
                Serial1.println("BELT cutter timeout");
                sys.BELTCutterDone = true; 
                break;
            }
            lastSens = curSens;
            delay(10);
        }
        // 상태 복구
        motorStarted = false;
        isRunning = false;
    }

private:
    // -----------------------------------------------------
    // 띠 분리기 모터 시작
    // - 내부 상태 초기화
    // - 모터 구동 시작
    // -----------------------------------------------------
    void startMotor() {
        isRunning = true;
        sensorDetached = false;
        hasRetried = false;
        startMs = millis();
        digitalWrite(Pin::BELT_MOTOR, HIGH);
        Serial1.println("BELT motor started - cutting");
        sys.BELTCutterDone = false;
        sys.BELTManualTrigger = false;
    }
    // -----------------------------------------------------
    // 띠 분리기 동작 중 로직 처리
    // - 물림 상태 보호
    // - 센서 기반 분리 완료 판단
    // - 타임아웃 처리
    // -----------------------------------------------------
    void processRunLogic(int currentSensorState) {
        unsigned long elapsed = millis() - startMs;
        // -----------------------------
        // 물림 방지 로직 (1회 재시도)
        // -----------------------------
        if (!hasRetried && elapsed > RETRY_MS) {
            Serial1.println("BELT cutter jam protection: Retrying");
            digitalWrite(Pin::BELT_MOTOR, LOW); delay(300);
            digitalWrite(Pin::BELT_MOTOR, HIGH);
            hasRetried = true;
        }
        // -----------------------------
        // 센서 기반 분리 완료
        // -----------------------------
        if (elapsed > SENSOR_IGNORE_MS) {
            // 띠 분리 감지
            if (currentSensorState == LOW) sensorDetached = true;
            // 분리 후 복귀 감지 → 완료
            if (sensorDetached && lastSensorState == LOW && currentSensorState == HIGH) {
                stopMotor(true);
            }
        }
        // -----------------------------
        // 최대 동작 시간 초과 (타임아웃)
        // -----------------------------
        if (elapsed > MAX_RUN_MS) {
            stopMotor(false);
            Serial1.println("BELT cutter timeout");
        }
    }
    // -----------------------------------------------------
    // 띠 분리기 모터 정지
    // @param success 분리 정상 여부
    // -----------------------------------------------------
    void stopMotor(bool success) {
        digitalWrite(Pin::BELT_MOTOR, LOW);
        // 내부 초기화
        isRunning = false;
        sensorDetached = false;
        // 메인 루프 완료 신호 전달
        sys.BELTCutterDone = true;
        if (success) Serial1.println("BELT cutting done");
    }
};
// =========================================================
// 에러 처리
// - 시스템 에러 발생 시 공통 처리 인터페이스
// =========================================================
class ErrorHandler {
public:
    // -----------------------------------------------------
    // 에러 발생 트리거
    // @param msg 에러 메시지
    // -----------------------------------------------------
    static void trigger(const char* msg); 
};
// =========================================================
// 투입구 제어 클래스
// - 투입구 개폐 제어
// - MC12B 연동
// - 손 감지 포함
// =========================================================
class DoorController {
public:
    // -----------------------------------------------------
    // 투입구 열기
    // @param useInverter MC12B 사용 여부
    // -----------------------------------------------------
    void open(bool useInverter = true) {
        if (useInverter) {
            InverterController::enable();
            InverterController::setFwd(true); // MC12B 동작
            Serial1.println("Knife activated!");
        }

        int state = digitalRead(Pin::SENSOR_DOOR_OPEN);
        Serial1.print("Door Open Sensor: "); Serial1.println(state);
        // 투입구 안열림
        if (state == LOW) {
            Serial1.println("Opening door...");
            unsigned long start = millis();
            
            while(digitalRead(Pin::SENSOR_DOOR_OPEN) == LOW) {
                // 시리얼 명령 및 에러 상태 체크
                globalCheckSerial();
                if(sys.isError) break;

                // 투입구 개방 방향 제어
                motor12V.runSpecialOpen(sys.speed_DO);
                delay(50);
                // 투입구 타임아웃
                if (millis() - start > 15000) {
                    ErrorHandler::trigger("Open door timeout");
                    break;
                }
            }
            if(!sys.isError) Serial1.println("Door opened.");
        } else {
            Serial1.println("Door already open.");
        }
        motor12V.stop();
    }
    // -----------------------------------------------------
    // 투입구 닫기
    // - 손 감지 시 즉시 재개방
    // -----------------------------------------------------
    void close() {
        int state = digitalRead(Pin::SENSOR_DOOR_CLOSE);
        Serial1.print("Door Close Sensor: "); Serial1.println(state);
        // 투입구 안닫힘
        if (state == LOW) {
            Serial1.println("Closing door...");
            unsigned long start = millis();

            while(digitalRead(Pin::SENSOR_DOOR_CLOSE) == LOW) {
                // 시리얼 명령 및 에러 체크
                globalCheckSerial();
                if(sys.isError) break;
                // 손감지 시 안전 처리
                if(Sensors::isHandDetected()) {
                    Serial1.println("*** HAND DETECTED! Reopening ***");
                    // 즉시 정지 후 재개방
                    motor12V.stop();
                    open(true); // MC12B 포함
                    delay(3000);
                    // 손 제거 대기
                    while(Sensors::isHandDetected()) {
                        Serial1.println("Remove hand..."); delay(500);
                    }
                    delay(1000);
                    start = millis(); // 타이머 초기화
                    continue;
                }
                // 투입구 정상 닫힘 처리
                motor12V.runSpecialClose(sys.speed_DC);
                delay(50);

                if (millis() - start > 15000) {
                    ErrorHandler::trigger("Close door timeout");
                    break;
                }
            }
            if(!sys.isError) {
                Serial1.println("Door closed successfully!");
                if(Sensors::isDoorClosedLimitReached()) Serial1.println("Door closed");
            }
        } else {
            Serial1.println("Door already closed.");
        }
        // 모터 정지
        motor12V.stop();
    }
    // -----------------------------------------------------
    // 에러 시 투입구 닫기
    // -----------------------------------------------------
    void emergencyClose() {
        // 이미 닫혀 있으면 무시
        if (Sensors::isDoorClosedLimitReached()) return;
        Serial1.println("Emergency closing...");
        unsigned long start = millis();
        while(digitalRead(Pin::SENSOR_DOOR_CLOSE) == LOW) {
            // 손 감지 시 즉시 중단
            if(Sensors::isHandDetected()) break;
            // 고정 속도로 닫힘 시도
            motor12V.runSpecialClose(120);
            // 타임아웃
            if (millis() - start > 8000) break;
            delay(50);
        }
        motor12V.stop();
    }
};
// =========================================================
// AI_ZONE 제어
// - AI_ZONE 센서 1, 2 기반 24V 모터 제어
// - 페트병 위치 이동, 끼임 감지 및 복구
// =========================================================
class AI_ZONEController {
public:
    // 전체 AI_ZONE 동작 시퀀스
    // Motor1 → 대기 → Motor2
    void runSequence() {
        runMotor1();    // Sensor2 기준 구동
        if(sys.isError) return; // 에러 발생 시 중단
        delay(3000);    // 안정화 대기
        runMotor2();    // Sensor1 기준 구동
    }
    // =====================================================
    // Motor1 동작
    // - SENSOR_AI_ZONE_2가 LOW가 될 때까지 하강(Backward)
    // - 일정 시간 초과 시 끼임으로 판단
    // =====================================================
    void runMotor1() { 
        LED::blinkBlue();
        // Sensor2가 HIGH 일 경우 아직 감지 안됨
        if (digitalRead(Pin::SENSOR_AI_ZONE_2) == HIGH) {
            Serial1.println("Sensor2 HIGH. Running 24V Direction 1...");
            unsigned long start = millis();
            unsigned long retryTime = 3000; // 끼임 판단 기준 시간
            
            // Sensor2 감지까지 반복
            while(digitalRead(Pin::SENSOR_AI_ZONE_2) == HIGH) {
                globalCheckSerial();    // 시리얼 명령 및 에러 체크
                motor24V.runBackward(sys.speed_D1); // 24V 모터 하강
                delay(50);
                
                // 끼임 감지 - 시간 초과
                if (millis() - start > retryTime) {
                    Serial1.println("Jam detected. Running Motor2 to unjam...");
                    runMotor2(); // 반대 방향으로 이동하여 끼임 해제 시도
                    break;
                }
                digitalWrite(Pin::LED_BLUE, HIGH); // 동작 표시
            }
            if(!sys.isError) Serial1.println("Sensor2 reached (LOW)."); // 정상 도달
        }
        motor24V.stop(); // 모터 정지
    }

    // =====================================================
    // Motor2 동작
    // - SENSOR_AI_ZONE_1이 LOW가 될 때까지 상승
    // - 타임아웃 시 에러 발생
    // =====================================================
    void runMotor2() { 
        if (digitalRead(Pin::SENSOR_AI_ZONE_1) == HIGH) {
            Serial1.println("Sensor1 HIGH. Running 24V Direction 2...");
            unsigned long start = millis();
            // Sensor1 감지까지 반복
            while(digitalRead(Pin::SENSOR_AI_ZONE_1) == HIGH) {
                globalCheckSerial();    // 에러 체크
                motor24V.runForward(sys.speed_D2); //24V 모터 상승
                delay(50);
                // 타임아웃
                if (millis() - start > 15000) {
                    ErrorHandler::trigger("Motor2 Timeout");
                    break;
                }
            }
            if(!sys.isError) Serial1.println("Sensor1 reached (LOW)."); // 정상 도달
        }
        motor24V.stop();// 모터 정지
        
        // 사이클 종료 후 띠 분리기 관련 상태 초기화
        sys.BELTCutterDone = false;
        sys.BELTOpenTriggered = false;
        sys.BELTManualTrigger = false;
    }
    // =====================================================
    // Repair Mode
    // - 양쪽 AI_ZONE 센서가 모두 HIGH일 때
    // - 병이 중간에서 끼었을 경우 강제 복구
    // =====================================================
    void repairMode() {
        // 센서 상태 확인
        bool s1 = Sensors::isAI_ZONE1Detected();
        bool s2 = Sensors::isAI_ZONE2Detected(); 
        // 둘 다 감지 시 정상
        if(!s1 && !s2) return;
        // 양쪽 모두 HIGH 일 경우 끼임 판정
        if(digitalRead(Pin::SENSOR_AI_ZONE_1) == HIGH && digitalRead(Pin::SENSOR_AI_ZONE_2) == HIGH) {
             InverterController::enable();  // MC-12B 활성화
             InverterController::setFwd(true); //FA50 Fwd
             Serial1.println("Repair mode: Inverter ON");
             
             bool success = false;
             // 최대 10회 복구 시도
             for(int i=0; i<10; i++) {
                 Serial1.print("Repair attempt "); Serial1.println(i+1);
                 // -------------------------------
                 // Step 1: 하강 (Sensor2 찾기)
                 // -------------------------------
                 unsigned long t = millis();
                 while(digitalRead(Pin::SENSOR_AI_ZONE_2) == HIGH && (millis() - t < 5000)) {
                     motor24V.runBackward(sys.speed_D1); 
                     delay(50);
                 }
                  // 하강 실패 시 반대 방향으로 풀기
                 if(digitalRead(Pin::SENSOR_AI_ZONE_2) == HIGH) {
                     t = millis();
                     while(millis() - t < 5000) { motor24V.runForward(sys.speed_D1); delay(50); }
                     motor24V.stop(); delay(500);
                     continue;
                 }
                 // -------------------------------
                 // Step 2: 상승 (Sensor1 찾기)
                 // -------------------------------
                 t = millis();
                 while(digitalRead(Pin::SENSOR_AI_ZONE_1) == HIGH && (millis() - t < 5000)) {
                     motor24V.runForward(sys.speed_D1); delay(50);
                 }
                 // Sensor1 도달 시 성공
                 if(digitalRead(Pin::SENSOR_AI_ZONE_1) == LOW) {
                     success = true;
                     break;
                 } else { delay(500); }
             }
             
             motor24V.stop();
             // 복구 성공 처리
             if(success) {
                 Serial1.println("Repair success. Running inverter 3s...");
                 delay(3000);
                 InverterController::setFwd(false);
                 InverterController::disable();
                 Serial1.println("System restored.");
             } // 복구 실패 처리
             else {
                 Serial1.println("Repair failed.");
                 InverterController::setFwd(false); 
                 InverterController::disable();
             }
        }
    }
};

// =========================================================
// Subsystem Instances
// - 시스템에서 사용하는 주요 제어 인스턴스
// =========================================================
DoorController door; // 투입구 제어
AI_ZONEController AI_ZONE; // AI-ZONE 24V 모터 제어
BELTCutterManager BELTCutter; // 띠 분리기 제어

// =========================================================
// ErrorHandler::trigger
// - 시스템 공통 에러 처리 함수
// - 최초 에러 1회만 처리 (중복 방지)
// =========================================================
void ErrorHandler::trigger(const char* msg) {
    if (sys.isError) return;    // 이미 에러 상태일 경우 무시
    // 에러 메세지 출력
    Serial1.print("ERROR: "); Serial1.println(msg);
    globalStop();   // 전체 동작 종료
    door.emergencyClose();  // 투입구 닫기
    InverterController::disable(); // 감속기 및 인버터 전원 차단
    sys.isError = true; // 시스템 에러 상태 설정
}

// =========================================================
// COMMAND PROCESSING
// - 전역 명령 및 시스템 상태 제어
// =========================================================

// ---------------------------------------------------------
// globalStop
// - 모든 동작 즉시 중지
// - 시스템 상태 초기화 및 로그아웃 처리
// ---------------------------------------------------------
void globalStop() {
    // 모든 모터 정지
    InverterController::stop();
    motor12V.stop();
    motor24V.stop();
    // 역회전 모드 활성화 시 해제
    if (sys.isReverseMode) InverterController::setRevMode(false);
    // 상태 초기화
    sys.isLoggedIn = false; // 강제 로그아웃
    sys.BELTCutterDone = false; // 띠 분리 플래그 리셋
    sys.BELTOpenTriggered = false;
    sys.BELTManualTrigger = false;
    sys.isError = false;    // 에러 상태 해제
    // 상태 안내 메세지
    Serial1.println("STATUS:STOPPED_LOGGED_OUT");
    Serial1.println("INFO:LOGIN_REQUIRED");
}

// =========================================================
// CommandProcessor
// - Serial 명령 수신 및 처리
// - 로그인/권한/명령 담당
// =========================================================
class CommandProcessor {
public:
    // -----------------------------------------------------
    // 시리얼 입력 처리
    // -----------------------------------------------------
    static void processInput() {
        if (Serial1.available() > 0) {
            String input = Serial1.readStringUntil('\n');
            input.trim();
            if (input.length() > 0) {
                handleCommand(input);
            }
        }
    }
    // -----------------------------------------------------
    // 명령 문자열 해석 및 처리
    // -----------------------------------------------------
    static void handleCommand(String cmd) {
        cmd.toUpperCase();  // 대소문자 무시

        // 1. 로그인 명령 (우선순위 1)
        if (cmd == "LOGIN_ADMIN") {
            sendAck(cmd);
            login(true);
            return;
        } 
        if (cmd == "LOGIN_USER") {
            sendAck(cmd);
            login(false);
            return;
        }

        // 2. 관리자 설정 명령
        if (cmd.startsWith("SET_SPEEDS:") || cmd == "GET_SPEEDS") {
            if (!sys.isAdmin) {
                sendNack(cmd, "ADMIN_REQUIRED");
                return;
            }
            sendAck(cmd);
            if (cmd.startsWith("SET_SPEEDS:")) parseSpeeds(cmd);
            else SpeedManager::printSpeeds();
            return;
        }

        // 3. 로그인 없어도 되는 명령
        if (!sys.isLoggedIn) {
            if (cmd == "HELP") {
                sendAck(cmd); showHelp(false);
            } else if (cmd == "GET_STATUS") {
                sendAck(cmd); Sensors::report();
            } else {
                sendNack(cmd, "LOGIN_REQUIRED");
            }
            return;
        }

        // 4. 로그인 이후 동작 명령 처리
        if (!dispatchCommand(cmd)) {
            sendNack(cmd, "UNKNOWN_COMMAND");
        }
    }

    // -----------------------------------------------------
    // 실제 동작 명령 분기
    // @return 명령 인식 여부
    // 필요 시 cmd 변경
    // -----------------------------------------------------
    static bool dispatchCommand(String cmd) {
        if (cmd == "DOOR_OPEN")        { sendAck(cmd); door.open(true); return true; }
        if (cmd == "DOOR_OPEN_SIMPLE") { sendAck(cmd); door.open(false); return true; }
        if (cmd == "DOOR_CLOSE")       { sendAck(cmd); door.close(); return true; }
        if (cmd == "AI_ZONE_BACK")      { sendAck(cmd); AI_ZONE.runMotor1(); return true; }
        if (cmd == "AI_ZONE_FWD")       { sendAck(cmd); AI_ZONE.runMotor2(); return true; }
        if (cmd == "AUTO_RUN")         { sendAck(cmd); runAuto(); return true; }
        if (cmd == "LED_TEST")         { sendAck(cmd); LED::blinkBlue(); return true; }
        if (cmd == "GET_STATUS")       { sendAck(cmd); Sensors::report(); return true; }
        if (cmd == "STOP")             { sendAck(cmd); globalStop(); return true; }
        if (cmd == "HELP")             { sendAck(cmd); showHelp(true); return true; }
        if (cmd == "REPAIR")           { sendAck(cmd); AI_ZONE.repairMode(); return true; }
        if (cmd == "LOGOUT")           { sendAck(cmd); globalStop(); return true; }
        if (cmd == "BELT_CUT")        { sendAck(cmd); BELTCutter.manualTrigger(); return true; }
        if (cmd == "BELT_RETRY")      { sendAck(cmd); BELTCutter.retryTrigger(); return true; }
        if (cmd == "CONFIG_REVERSE")   { sendAck(cmd); InverterController::setRevMode(!sys.isReverseMode); return true; }
        if (cmd == "INVERTER_OFF")     { sendAck(cmd); InverterController::disable(); return true; }
        if (cmd == "INVERTER_ON")      { sendAck(cmd); InverterController::on(); return true; }
        
        return false; // 없는 명령어
    }
    // -----------------------------------------------------
    // ACK 응답 전송
    // -----------------------------------------------------
    static void sendAck(String cmd) {
        Serial1.print("ACK:"); Serial1.println(cmd);
    }

    // -----------------------------------------------------
    // NACK 응답 전송
    // -----------------------------------------------------
    static void sendNack(String cmd, String reason) {
        Serial1.print("NACK:"); Serial1.print(cmd); Serial1.print(":"); Serial1.println(reason);
    }
    // -----------------------------------------------------
    // 로그인 처리
    // -----------------------------------------------------
    static void login(bool admin) {
        sys.isLoggedIn = true;
        sys.isAdmin = admin;
        sys.isError = false;
        sys.BELTManualTrigger = false;
        Serial1.println(admin ? "INFO:LOGIN_ADMIN_SUCCESS" : "INFO:LOGIN_USER_SUCCESS");
        Serial1.println("INFO:ERROR_STATE_CLEARED");
        if (admin) SpeedManager::printSpeeds();
    }
    // -----------------------------------------------------
    // 도움말 출력
    // -----------------------------------------------------
    static void showHelp(bool loggedIn) {
        Serial1.println("=== API COMMAND LIST ===");
        if (!loggedIn) {
            Serial1.println("LOGIN_ADMIN, LOGIN_USER, GET_STATUS");
        } else {
            Serial1.println("DOOR_OPEN, DOOR_CLOSE, AI_ZONE_BACK, AI_ZONE_FWD");
            Serial1.println("AUTO_RUN, BELT_CUT, STOP, LOGOUT");
            Serial1.println("GET_STATUS, GET_SPEEDS, SET_SPEEDS:...");
        }
        Serial1.println("========================");
    }
    // -----------------------------------------------------
    // 속도 설정
    // -----------------------------------------------------
    static void parseSpeeds(String cmd) {
        // 속도 설정 포맷 SET_SPEEDS:DO=255;DC=120;D1=70;D2=90
        int d_o = getVal(cmd, "DO=", sys.speed_DO);
        int d_c = getVal(cmd, "DC=", sys.speed_DC);
        int d_1 = getVal(cmd, "D1=", sys.speed_D1);
        int d_2 = getVal(cmd, "D2=", sys.speed_D2);
        SpeedManager::save(d_o, d_c, d_1, d_2);
    }
    // -----------------------------------------------------
    // 개별 속도 값 추출
    // -----------------------------------------------------
    static int getVal(String cmd, String key, int current) {
        int idx = cmd.indexOf(key);
        if (idx == -1) return current;
        int end = cmd.indexOf(';', idx);
        if (end == -1) end = cmd.length();
        return constrain(cmd.substring(idx + key.length(), end).toInt(), 0, 255);
    }
    
    // -----------------------------------------------------
    // 자동 시퀀스 실행
    // -----------------------------------------------------
    static void runAuto() {
        Serial1.println("INFO:SEQ_START");
        door.open(true);
        if(sys.isError) return; delay(3000);
        
        door.close();
        if(sys.isError) return; delay(2000); 
        
        AI_ZONE.runMotor1();
        if(sys.isError) return; delay(3000);
        
        AI_ZONE.runMotor2();
        if(sys.isError) return; delay(10000);
        
        Serial1.println("INFO:SEQ_COMPLETE");
    }
};

// =========================================================
// Global Helper: globalCheckSerial
// - 내부에서 시리얼 명령을 처리하기 위한 보조 함수
// - 긴 동작 중에도 STOP 등 긴급 명령 수신 가능
// =========================================================
void globalCheckSerial() {
    // 시리얼 입력이 있는 경우에만 처리
    if (Serial1.available() > 0) {
        String line = Serial1.readStringUntil('\n');
        line.trim();
        if (line.length() == 0) return;
        // 대소문자 구분 없이 처리
        line.toUpperCase();
        
        // -------------------------------------------------
        // 동작 중 우선 처리 명령
        // -------------------------------------------------
        if (line == "STOP" || line == "LOGOUT") {
            // 즉시 정지 및 로그아웃
            globalStop();
        } else if (line.startsWith("SET_SPEEDS:")) {
            // 관리자 권한에서만 속도 설정 허용
            if (sys.isAdmin) CommandProcessor::parseSpeeds(line);
        } else if (line == "GET_SPEEDS") {
            // 관리자 권한에서 현재 속도 출력
            if (sys.isAdmin) SpeedManager::printSpeeds();
        } else if (line == "DOOR_OPEN_SIMPLE") {
            // 끼임 감지 시 문 열기 명령 허용
            Serial1.println("ACK:DOOR_OPEN_SIMPLE");
            // 안전을 위해 문이 열리는 동안 다른 모터(AI Zone) 일시 정지
            motor24V.stop();
            door.open(false);
        }
    }
}

// =========================================================
// MAIN FA-DUINO ENTRY POINTS
// - faduino 프로그램 시작 지점
// =========================================================

void setup() {
    // 시리얼 통신 초기화 (외부 제어 / 웹 연동)
    Serial1.begin(9600);
    Serial1.setTimeout(50); // 루프에서도 응답 유지용 타임아웃
    // -----------------------------------------------------
    // 하드웨어 및 서브시스템 초기화
    // -----------------------------------------------------
    motor24V.init();            // 24V 모터 초기화
    motor12V.init();            // 12V 모터 초기화
    InverterController::init(); // 인버터 제어 핀 초기화
    Sensors::init();            // 모든 센서 입력 초기화
    LED::init();                // 상태 LED 초기화
    BELTCutter.init();          // 띠 분리기 초기화
    SpeedManager::init();       // EEPROM 기반 속도 설정 로드
    // 시스템 시작 안내 메시지
    Serial1.println("=== System Initialized (Refactored) ===");
    Serial1.println("*** LOGIN REQUIRED (98=Admin, 99=User) ***");
}

void loop() {
    // -----------------------------------------------------
    // 1. 띠 분리기 백그라운드 처리
    // - 로그인 상태에서만 동작
    // - 스위치 및 센서 감지 기반 자동 실행
    // -----------------------------------------------------
    BELTCutter.update();

    // -----------------------------------------------------
    // 2. 띠 분리 완료 후 도어 자동 개방 트리거
    // -----------------------------------------------------
    if (sys.BELTCutterDone && !sys.BELTOpenTriggered && !sys.BELTManualTrigger) {
        Serial1.println("Door will opened..");
        door.open(true);    // MC-12B 및 FA-50 + 투입구 개방
        sys.BELTOpenTriggered = true;   // 중복 방지
    }

    // -----------------------------------------------------
    // 3. 시리얼 명령 처리
    // -----------------------------------------------------
    CommandProcessor::processInput();
}
