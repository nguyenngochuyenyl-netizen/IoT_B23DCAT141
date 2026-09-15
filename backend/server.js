require("dotenv").config();

const express = require("express");
const mqtt = require("mqtt");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const MQTT_SERVER = process.env.MQTT_SERVER;
const MQTT_USER = process.env.MQTT_USER;
const MQTT_PASSWORD = process.env.MQTT_PASSWORD;

const SENSOR_TOPIC =
    process.env.MQTT_TOPIC_SENSOR || "sensor_data";

const CONTROL_TOPIC =
    process.env.MQTT_TOPIC_CONTROL || "device_control";

const STATUS_TOPIC =
    process.env.MQTT_TOPIC_STATUS || "device_status";

// ===============================
// DỮ LIỆU TẠM THỜI
// ===============================

let latestSensorData = {
    temperature: null,
    humidity: null,
    light: null,
    rawData: null,
    updatedAt: null
};

let deviceStatus = {
    light: false,
    fan: false,
    air: false
};

let actionHistory = [];

// ===============================
// KẾT NỐI MQTT
// ===============================

const mqttClient = mqtt.connect(MQTT_SERVER, {
    username: MQTT_USER,
    password: MQTT_PASSWORD,
    reconnectPeriod: 3000
});

mqttClient.on("connect", () => {
    console.log("Da ket noi MQTT Broker");

    mqttClient.subscribe(SENSOR_TOPIC, (error) => {
        if (error) {
            console.log("Loi subscribe sensor:", error.message);
        } else {
            console.log(`Da subscribe: ${SENSOR_TOPIC}`);
        }
    });

    mqttClient.subscribe(STATUS_TOPIC, (error) => {
        if (error) {
            console.log("Loi subscribe status:", error.message);
        } else {
            console.log(`Da subscribe: ${STATUS_TOPIC}`);
        }
    });
});

mqttClient.on("reconnect", () => {
    console.log("Dang ket noi lai MQTT...");
});

mqttClient.on("error", (error) => {
    console.log("Loi MQTT:", error.message);
});

mqttClient.on("offline", () => {
    console.log("MQTT dang offline");
});

// ===============================
// NHẬN MESSAGE TỪ ESP8266
// ===============================

mqttClient.on("message", (topic, messageBuffer) => {
    const message = messageBuffer.toString().trim();

    console.log(`[MQTT] ${topic}: ${message}`);

    if (topic === SENSOR_TOPIC) {
        parseSensorData(message);
    }

    if (topic === STATUS_TOPIC) {
        updateDeviceStatus(message);
    }
});

// ===============================
// PHÂN TÍCH CẢM BIẾN
// ===============================

function parseSensorData(message) {
    const temperatureMatch =
        message.match(/Nhiet do:\s*([\d.]+)/i);

    const humidityMatch =
        message.match(/Do am:\s*([\d.]+)/i);

    const lightMatch =
        message.match(/Anh sang:\s*([\d.]+)/i);

    latestSensorData = {
        temperature: temperatureMatch
            ? Number(temperatureMatch[1])
            : null,

        humidity: humidityMatch
            ? Number(humidityMatch[1])
            : null,

        light: lightMatch
            ? Number(lightMatch[1])
            : null,

        rawData: message,
        updatedAt: new Date().toISOString()
    };

    console.log("Sensor data:", latestSensorData);
}

// ===============================
// CẬP NHẬT TRẠNG THÁI THIẾT BỊ
// ===============================

function updateDeviceStatus(message) {
    const action = message.toUpperCase();

    if (action === "LIGHT_ON") {
        deviceStatus.light = true;
    }

    if (action === "LIGHT_OFF") {
        deviceStatus.light = false;
    }

    if (action === "FAN_ON") {
        deviceStatus.fan = true;
    }

    if (action === "FAN_OFF") {
        deviceStatus.fan = false;
    }

    if (action === "AIR_ON") {
        deviceStatus.air = true;
    }

    if (action === "AIR_OFF") {
        deviceStatus.air = false;
    }

    const validActions = [
        "LIGHT_ON",
        "LIGHT_OFF",
        "FAN_ON",
        "FAN_OFF",
        "AIR_ON",
        "AIR_OFF"
    ];

    if (validActions.includes(action)) {
        actionHistory.unshift({
            device: getDeviceName(action),
            action: action,
            createdAt: new Date().toISOString()
        });

        actionHistory = actionHistory.slice(0, 100);
    }

    console.log("Device status:", deviceStatus);
}

function getDeviceName(action) {
    if (action.startsWith("LIGHT")) {
        return "Den phong";
    }

    if (action.startsWith("FAN")) {
        return "Quat";
    }

    if (action.startsWith("AIR")) {
        return "Dieu hoa";
    }

    return "Khong xac dinh";
}

// ===============================
// API KIỂM TRA
// ===============================

app.get("/", (req, res) => {
    res.json({
        message: "IoT Smart Class Backend dang hoat dong",
        status: "running"
    });
});

app.get("/api/sensor-data/latest", (req, res) => {
    res.json(latestSensorData);
});

app.get("/api/device-status", (req, res) => {
    res.json(deviceStatus);
});

app.get("/api/action-history", (req, res) => {
    res.json(actionHistory);
});

// ===============================
// HÀM GỬI LỆNH MQTT
// ===============================

function publishDeviceCommand(command, res) {
    if (!mqttClient.connected) {
        return res.status(503).json({
            success: false,
            message: "MQTT Broker chua ket noi"
        });
    }

    mqttClient.publish(CONTROL_TOPIC, command, (error) => {
        if (error) {
            return res.status(500).json({
                success: false,
                message: "Khong gui duoc lenh MQTT",
                error: error.message
            });
        }

        console.log(`Da gui lenh: ${command}`);

        res.json({
            success: true,
            command: command,
            topic: CONTROL_TOPIC
        });
    });
}

// ===============================
// API ĐIỀU KHIỂN ĐÈN
// ===============================

app.post("/api/device/light/on", (req, res) => {
    publishDeviceCommand("LIGHT_ON", res);
});

app.post("/api/device/light/off", (req, res) => {
    publishDeviceCommand("LIGHT_OFF", res);
});

// ===============================
// API ĐIỀU KHIỂN QUẠT
// ===============================

app.post("/api/device/fan/on", (req, res) => {
    publishDeviceCommand("FAN_ON", res);
});

app.post("/api/device/fan/off", (req, res) => {
    publishDeviceCommand("FAN_OFF", res);
});

// ===============================
// API ĐIỀU KHIỂN ĐIỀU HÒA
// ===============================

app.post("/api/device/air/on", (req, res) => {
    publishDeviceCommand("AIR_ON", res);
});

app.post("/api/device/air/off", (req, res) => {
    publishDeviceCommand("AIR_OFF", res);
});

// ===============================
// KHỞI ĐỘNG SERVER
// ===============================

app.listen(PORT, () => {
    console.log(`Backend dang chay tai http://localhost:${PORT}`);
});