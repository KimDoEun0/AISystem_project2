// 1. 공공데이터포털 마이페이지에서 발급받은 [일반 인증키 (Encoding)] 입력
const SERVICE_KEY = '8df9681b1748b09a3badc6afff5e72bf6fba7f96507b697945782d3dcf7c4041'; 

document.getElementById('searchBtn').addEventListener('click', fetchBusArrival);
document.getElementById('arsIdInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') fetchBusArrival();
});

async function fetchBusArrival() {
  const arsId = document.getElementById('arsIdInput').value.trim();
  const loading = document.getElementById('loading');
  const errorMsg = document.getElementById('errorMsg');
  const stationTitle = document.getElementById('stationTitle');
  const busList = document.getElementById('busList');

  if (!arsId) {
    alert('정류소 고유번호 5자리를 입력해주세요.');
    return;
  }

  // 화면 초기화
  errorMsg.classList.add('hidden');
  busList.innerHTML = '';
  stationTitle.innerText = '';
  loading.classList.remove('hidden');

  // API URL 생성
  const targetUrl = `http://ws.bus.go.kr/api/rest/stationinfo/getStationByUid?serviceKey=${SERVICE_KEY}&arsId=${arsId}&resultType=json`;
  
  // 안정적인 AllOrigins CORS 프록시 사용
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;

  try {
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error('네트워크 응답이 올바르지 않습니다.');

    const data = await response.json();
    const items = data.msgBody?.itemList;

    loading.classList.add('hidden');

    if (!items || items.length === 0) {
      errorMsg.innerText = '조회된 버스도착 정보가 없거나 정류소 번호가 올바르지 않습니다.';
      errorMsg.classList.remove('hidden');
      return;
    }

    const itemList = Array.isArray(items) ? items : [items];
    stationTitle.innerText = `🚏 정류소: ${itemList[0].stNm} (${arsId})`;

    itemList.forEach(bus => {
      const li = document.createElement('li');
      li.className = 'bus-item';
      li.innerHTML = `
        <div class="bus-title">[${bus.rtNm}] ${bus.busRouteAbrv}번 버스</div>
        <div class="bus-info">• 첫 번째 차량: ${bus.arrmsg1}</div>
        <div class="bus-info">• 두 번째 차량: ${bus.arrmsg2}</div>
      `;
      busList.appendChild(li);
    });

  } catch (err) {
    loading.classList.add('hidden');
    errorMsg.innerText = `오류 발생: ${err.message}`;
    errorMsg.classList.remove('hidden');
  }
}
