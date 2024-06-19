const express = require("express");
const { SerialPort } = require("serialport");
const nunjucks = require("nunjucks");
const dotenv = require("dotenv");
const path = require("path");
const morgan = require("morgan");
const { sequelize } = require("./models");
const { IotSensors } = require("./models");
const { FeedSetting } = require("./models");
const { WaterSupplyLogs } = require("./models");

const app = express();

const MainRouter = require("./routes/main");
const feedRouter = require("./routes/feed");
const waterRouter = require("./routes/water");

dotenv.config();

/*==============================================
 파일 액세스 허용
==============================================*/
app.set("port", process.env.PORT || 3000);
app.set("view engine", "html"); // 넉적슨 임포팅 부분
nunjucks.configure("views", {
  express: app,
  watch: true,
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "/views/main.html"));
});
app.get("/water.html", (req, res) => {
  res.sendFile(path.join(__dirname, "/views/water.html"));
});

/*==============================================
 아두이노 시리얼 포트 설정
==============================================*/
const arduinoCOMPort = "COM3";
const com1 = new SerialPort({
  path: arduinoCOMPort,
  baudRate: 9600, 
  dataBits: 8,
  parity: "none",
  stopBits: 1,
  flowControl: false,
});

com1.on("open", function () {
  console.log("open serial communication");
  console.log("http://localhost:3000/");
});

let lastDataReceivedAt = null;

com1.on("data", async function (data) {
  try {
    const dataString = data.toString().trim();
    const quantity = Number(dataString);
    
    // 유효성 검사: 데이터가 숫자이고 세 자리 숫자인지 확인
    if (!isNaN(quantity) && dataString.length === 3) {
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const time = now.toTimeString().split(' ')[0];

      // 현재 시간과 마지막 데이터 수신 시간 비교
      if (lastDataReceivedAt && now - lastDataReceivedAt < 1000) {
        console.log("짧은 시간 내에 다시 데이터 수신됨. 무시합니다.");
        return; // 짧은 시간 내에 다시 데이터가 수신된 경우, 무시
      }

      lastDataReceivedAt = now; // 최근 데이터 수신 시간 업데이트

      console.log("시리얼 데이터 수신:", dataString);
      console.log("분석된 데이터:", { date, time, quantity });

      let waterSupplyCount = quantity <= 300 ? 'O' : 'X';

      if (waterSupplyCount === 'O') {
        const newLog = await WaterSupplyLogs.create({ date, time, quantity });
        console.log("새로운 물 공급 로그 저장됨:", newLog);
      }

      const dataStringToSend = `WATER_SUPPLY ${waterSupplyCount} TIME ${time}\n`;
      com1.write(dataStringToSend, async function (err) {
        if (err) {
          console.error("시리얼 데이터 전송 오류:", err.message);
        } else {
          console.log("물 공급 및 시간 정보 전송 완료:", dataStringToSend);
        }
      });
    } else {
      console.log("유효하지 않은 데이터입니다:", dataString);
    }
  } catch (error) {
    console.error("물 공급 및 로그 저장 중 오류:", error);
  }
});

/*==============================================
 시퀄라이즈 DB 설정
==============================================*/
sequelize
  .sync({ force: false })
  .then(() => {
    console.log("데이터베이스 연결 성공");
  })
  .catch((err) => {
    console.error(err);
  });

app.use(morgan("dev"));
app.use(express.static(path.join(__dirname, "css")));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

/*==============================================
 아두이노 FEED 먹이 전송
==============================================*/
app.post("/feed", async (req, res) => {
  const { feedCount, hour, minute } = req.body;
  const dataString = `FEED ${feedCount} TIME ${hour}:${minute}\n`;

  com1.write(dataString, async function (err) {
    if (err) {
      return console.log("Error on write: ", err.message);
    } 
    console.log("Message sent complete");
    console.log(dataString);

    try {
      const newSetting = await FeedSetting.create({
        feed_count: feedCount,
        hour: hour,
        minute: minute,
      });
      console.log("새로운 설정값이 저장되었습니다:", newSetting);
      res.status(200).send("설정값이 성공적으로 저장되었습니다.");
    } catch (error) {
      console.error("설정값 저장 중 에러 발생:", error);
      res.status(500).send("설정값을 저장하는 도중 에러가 발생했습니다.");
    }
  });
});

app.post("/water-supply", async (req, res) => {
  const { date, time, quantity } = req.body;

  // 물 공급 로그 생성 시도
  try {
    // WaterSupplyLogs 모델을 사용하여 물 공급 로그 생성
    const newLog = await WaterSupplyLogs.create({
      date: date,
      time: time,
      quantity: quantity,
    });

    // 성공적으로 물 공급 로그가 생성되었음을 클라이언트에 응답
    console.log("새로운 물 공급 로그 저장됨:", newLog);
    res.status(200).send("물 공급 로그가 성공적으로 저장되었습니다.");
  } catch (error) {
    // 오류가 발생한 경우 오류 메시지를 클라이언트에 응답
    console.error("물 공급 로그 저장 중 오류:", error);
    res.status(500).send("물 공급 로그를 저장하는 도중 오류가 발생했습니다.");
  }
});

app.get("/water-supply-logs", async (req, res) => {
  try {
    const logs = await WaterSupplyLogs.findAll({
      limit: 10,
      order: [['createdAt', 'DESC']],
    });
    res.json(logs);
  } catch (error) {
    console.error("물 공급 로그 가져오기 오류:", error);
    res.status(500).send("물 공급 로그 가져오기 오류 발생.");
  }
});

/*==============================================
 Html 라우팅
==============================================*/
app.use("/main", MainRouter);
app.use("/feed", feedRouter);
app.use("/water", waterRouter);

app.use((req, res, next) => {
  const error = new Error(`${req.method} ${req.url} 라우터가 없습니다.`);
  error.status = 404;
  next(error);
});

app.use((err, req, res, next) => {
  res.locals.message = err.message;
  res.locals.error = process.env.NODE_ENV !== "production" ? err : {};
  res.status(err.status || 500);
  res.render("error");
});

app.get("/feed/:id", function (req, res) {
  console.log(req.params.id);
  com1.write(req.params.id);
  res.status(200).send("FEED Controll OK!!");
});

app.get("/water/:id", function (req, res) {
  console.log(req.params.id);
  com1.write(req.params.id);
  res.status(200).send("Water Control OK!!");
});

app.listen(app.get("port"), () => {
  console.log(app.get("port"), "번 포트에서 대기 중");
});
