// ==========================================
// 1. 서비스 기본 설정 값
// ==========================================
// [공공데이터포털] 일반 인증키 (Decoding Key)
const BUS_API_KEY = '8df9681b1748b09a3badc6afff5e72bf6fba7f96507b697945782d3dcf7c4041'; 

// [카카오 Developers] REST API 키 및 Refresh Token
const KAKAO_REST_API_KEY = 'dc0a10c20192875a1c7574634a05f7c9';
const KAKAO_REFRESH_TOKEN = 'jdB_zptGX1GzkAWmY0tDA5cTq4fj9lRwAAAAAgoXFp8AAAGhWBBogcc_xW4TVk05';

// [버스 정보 설정]
const TARGET_ARS_ID = '04247';              // 정류소 고유번호 (ARS-ID 5자리)
const TARGET_BUS_NUMBERS = ['4211', '150'];   // 메시지 알림을 받을 버스 번호 목록

/**
 * [카카오 토큰 자동 갱신] Refresh Token으로 유효한 Access Token 발급
 */
function getValidKakaoAccessToken() {
  const url = 'https://kauth.kakao.com/oauth/token';
  const payload = {
    grant_type: 'refresh_token',
    client_id: KAKAO_REST_API_KEY.trim(),
    refresh_token: KAKAO_REFRESH_TOKEN.trim()
  };

  const options = {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded;charset=utf-8',
    payload: payload,
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const resJson = JSON.parse(response.getContentText());

    if (resJson.access_token) {
      return resJson.access_token;
    } else {
      const errorMsg = resJson.error_description || resJson.error || '토큰 갱신 실패';
      throw new Error(`카카오 토큰 갱신 오류: ${errorMsg}`);
    }
  } catch (e) {
    throw new Error(e.message);
  }
}

/**
 * [메인 실행 함수] 서울시 버스 API 조회 후 카카오톡 나와의 채팅방으로 전송
 */
function checkBusArrivalAndSendKakao() {
  try {
    const baseUrl = "http://ws.bus.go.kr/api/rest/stationinfo/getStationByUidItem";
    const url = `${baseUrl}?serviceKey=${encodeURIComponent(BUS_API_KEY)}&arsId=${TARGET_ARS_ID}`;

    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) {
      throw new Error(`API 요청 실패 (코드: ${response.getResponseCode()})`);
    }

    const xmlText = response.getContentText();
    const document = XmlService.parse(xmlText);
    const root = document.getRootElement();

    const headerCd = getXmlChildValue(root.getChild('msgHeader'), 'headerCd');
    if (headerCd !== '0') {
      const headerMsg = getXmlChildValue(root.getChild('msgHeader'), 'headerMsg');
      throw new Error(`API 오류 (${headerCd}): ${headerMsg}`);
    }

    const itemList = root.getChild('msgBody').getChildren('itemList');
    
    // 대상 버스 필터링
    const targetArrivals = [];
    itemList.forEach(item => {
      const rtNm = getXmlChildValue(item, 'rtNm');
      const busRouteAbrv = getXmlChildValue(item, 'busRouteAbrv');
      
      if (TARGET_BUS_NUMBERS.includes(rtNm) || TARGET_BUS_NUMBERS.includes(busRouteAbrv)) {
        targetArrivals.push({
          rtNm: rtNm || busRouteAbrv,
          arrmsg1: getXmlChildValue(item, 'arrmsg1'),
          arrmsg2: getXmlChildValue(item, 'arrmsg2'),
          stNm: getXmlChildValue(item, 'stNm')
        });
      }
    });

    let msgText = '';
    if (targetArrivals.length === 0) {
      msgText = `🚌 [버스 도착 알림]\n\n현재 지정한 버스의 도착 정보가 제공되지 않습니다.`;
    } else {
      msgText = `🚌 [등/하교 버스 도착 알림]\n정류장: ${targetArrivals[0].stNm} (${TARGET_ARS_ID})\n--------------------\n`;
      targetArrivals.forEach(bus => {
        msgText += `• [${bus.rtNm}번 버스]\n - 첫번째: ${bus.arrmsg1}\n - 두번째: ${bus.arrmsg2}\n\n`;
      });
    }

    Logger.log('발송 메시지:\n' + msgText);

    // 유효한 카카오 Access Token 수급
    const accessToken = getValidKakaoAccessToken();

    // 카카오톡 나에게 메시지 보내기 API 호출
    const kakaoUrl = 'https://kapi.kakao.com/v2/api/talk/memo/default/send';
    const templateObject = {
      object_type: 'text',
      text: msgText,
      link: {
        web_url: 'https://map.kakao.com',
        mobile_web_url: 'https://map.kakao.com'
      },
      button_title: '카카오맵 열기'
    };

    const kakaoOptions = {
      method: 'post',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      },
      payload: {
        template_object: JSON.stringify(templateObject)
      },
      muteHttpExceptions: true
    };

    const kakaoRes = UrlFetchApp.fetch(kakaoUrl, kakaoOptions);
    const kakaoJson = JSON.parse(kakaoRes.getContentText());

    if (kakaoRes.getResponseCode() === 200 && kakaoJson.result_code === 0) {
      Logger.log('✅ 카카오톡 메시지 발송 성공');
    } else {
      Logger.log(`❌ 카카오톡 발송 실패: ${kakaoJson.msg}`);
    }

  } catch (error) {
    Logger.log('오류 발생: ' + error.toString());
  }
}

/**
 * [트리거 설정 함수] 매일 등/하교 15분 전 자동 실행 스케줄러 등록
 */
function setupDailyTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'checkBusArrivalAndSendKakao') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // 1. 등교 15분 전 (예: 07시 45분)
  ScriptApp.newTrigger('checkBusArrivalAndSendKakao')
    .timeBased()
    .atHour(7)
    .nearMinute(45)
    .everyDays(1)
    .create();

  // 2. 하교 15분 전 (예: 16시 45분)
  ScriptApp.newTrigger('checkBusArrivalAndSendKakao')
    .timeBased()
    .atHour(16)
    .nearMinute(45)
    .everyDays(1)
    .create();

  Logger.log('등/하교 전 자동 실행 트리거 설정 완료');
}

function getXmlChildValue(parentElement, childName) {
  if (!parentElement) return '';
  const child = parentElement.getChild(childName);
  return child ? child.getText() : '';
}
