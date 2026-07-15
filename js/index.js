/* =======================================================
   1. 스마트서울맵 OpenAPI V5 동적 로드 (Leaflet 확장팩)
======================================================= */
function loadSeoulMapAPI() {
    return new Promise((resolve, reject) => {
        if (typeof CONFIG === 'undefined' || !CONFIG.MAP_API_KEY) {
            console.warn("API 키가 없습니다. config.js를 확인하세요.");
            resolve();
            return;
        }

        const key = CONFIG.MAP_API_KEY;

        // 1. 서울맵 전용 CSS 로드
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `https://map.seoul.go.kr/openapi/v5/${key}/public/map/css/5.0`;
        document.head.appendChild(link);

        // 2. 서울맵 메인 JS (Leaflet + V5 코어) 로드
        const script1 = document.createElement('script');
        script1.src = `https://map.seoul.go.kr/openapi/v5/${key}/public/map/js/5.0`;
        document.head.appendChild(script1);

        // 메인 JS가 로드된 후에 좌표계 확장 JS를 로드해야 에러가 안 납니다.
        script1.onload = () => {
            // 3. 한국 좌표계(5179) 확장 JS 로드
            const script2 = document.createElement('script');
            script2.src = `https://map.seoul.go.kr/openapi/v5/${key}/public/map/base/js/5179/5.0`;

            script2.onload = () => resolve(); // 모든 로드 완료!
            script2.onerror = () => reject(new Error("좌표계 스크립트 로드 실패"));

            document.head.appendChild(script2);
        };

        script1.onerror = () => reject(new Error("서울맵 V5 메인 스크립트 로드 실패"));
    });
}



/* =======================================================
   2. 전역 스크롤 및 UI 컨트롤 (기존 index.js)
======================================================= */
function initGlobalUI() {
    const dots = document.querySelectorAll('.global-dot');
    const sections = document.querySelectorAll('.scroll-section');

    const observerOptions = {
        root: null,
        rootMargin: '-40% 0px -40% 0px',
        threshold: 0
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const currentNum = entry.target.getAttribute('data-section');
                dots.forEach(dot => {
                    dot.classList.remove('active');
                    if (dot.getAttribute('data-target-section') === currentNum) {
                        dot.classList.add('active');
                    }
                });
            }
        });
    }, observerOptions);

    sections.forEach(section => observer.observe(section));

    dots.forEach(dot => {
        dot.addEventListener('click', function () {
            const targetNum = this.getAttribute('data-target-section');
            const targetSection = document.querySelector(`.scroll-section[data-section="${targetNum}"]`);
            if (targetSection) {
                targetSection.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    const backToTopBtn = document.getElementById('backToTopBtn');
    if (backToTopBtn) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                backToTopBtn.classList.add('show');
            } else {
                backToTopBtn.classList.remove('show');
            }
        });

        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
}

/* =======================================================
   3. 섹션별 지도 및 기능 초기화 (기존 section1~6.js 영역)
======================================================= */

/* =======================================================
   도우미 함수: 곡선 생성 (섹션 2 용)
======================================================= */
function generateCurvedPath(coords) {
    if (coords.length < 2) return coords;
    let curvedCoords = [];
    for (let i = 0; i < coords.length - 1; i++) {
        const start = coords[i];
        const end = coords[i + 1];
        const lat1 = start[0], lng1 = start[1];
        const lat2 = end[0], lng2 = end[1];
        const midLat = (lat1 + lat2) / 2;
        const midLng = (lng1 + lng2) / 2;
        const dLat = lat2 - lat1;
        const dLng = lng2 - lng1;
        const intensity = 0.2;
        const isTargetLine = (i === 0 || i === 1 || i === 4);
        const direction = isTargetLine ? 1 : -1;
        const offset = intensity * direction;
        const cpLat = midLat - (dLng * offset);
        const cpLng = midLng + (dLat * offset);
        const steps = 20;
        for (let step = 0; step <= steps; step++) {
            const t = step / steps;
            const lat = (1 - t) * (1 - t) * lat1 + 2 * (1 - t) * t * cpLat + t * t * lat2;
            const lng = (1 - t) * (1 - t) * lng1 + 2 * (1 - t) * t * cpLng + t * t * lng2;
            if (i > 0 && step === 0) continue;
            curvedCoords.push([lat, lng]);
        }
    }
    return curvedCoords;
}

/* =======================================================
   Section 2 초기화: 고정형 카드 (Scrollytelling) 방식
======================================================= */
async function initSection2() {
    const mapContainer = document.getElementById('map-s2');
    if (!mapContainer) return;

    // 💡 1. 서울시 전용 좌표계(crs: getCrsEx()) 적용 및 맵 생성
    const mapS2 = L.map('map-s2', {
        crs: getCrsEx(),
        zoomControl: false,       // 줌 컨트롤 버튼(+,-) 숨기기
        scrollWheelZoom: false,   // 마우스 휠로 줌인/줌아웃 차단
        dragging: false,          // 🚀 마우스 드래그로 지도 이동 차단
        doubleClickZoom: false,   // 🚀 더블 클릭으로 줌 차단
        touchZoom: false,         // 🚀 모바일 손가락 터치(핀치) 줌 차단
        boxZoom: false,           // 🚀 Shift+드래그 줌 차단
        keyboard: false           // 🚀 키보드 방향키로 이동 차단
    }).setView([37.5759 + 0.001, 126.9850 - 0.01], 10);

    // 💡 2. 서울맵 V5 타일 적용 (DAWULGIS_EX)
    const BASE_MAP = `https://map.seoul.go.kr/openapi/v5/${CONFIG.MAP_API_KEY}/public/map/base/dawul_kor_normal/{z}/{j}/{k}/{x}/{y}/png`;
    new L.TileLayer.DAWULGIS_EX(BASE_MAP, { minZoom: 1, maxZoom: 15 }).addTo(mapS2);

    const resizeObserverS2 = new ResizeObserver(() => {
        mapS2.invalidateSize();
    });
    resizeObserverS2.observe(mapContainer);

    const pathLine = L.polyline([], {
        color: '#000000', weight: 3, dashArray: '8, 8', opacity: 1, lineJoin: 'round'
    }).addTo(mapS2);

    try {
        const response = await fetch('./assets/data/data1_3·1운동시간여행.geojson');
        const geojsonData = await response.json();
        const targetIds = ["46", "13", "78", "20", "37", "42", "40", "8", "24"];
        const timelineData = [];
        const locationsS2 = [];

        targetIds.forEach(targetId => {
            const feature = geojsonData.features.find(f => String(f.id) === targetId);
            if (feature) {
                let finalImgUrl = feature.properties.IMG_MAIN_URL || "";
                if (finalImgUrl && !finalImgUrl.startsWith("http")) {
                    finalImgUrl = finalImgUrl.startsWith("/")
                        ? "https://map.seoul.go.kr" + finalImgUrl
                        : "https://map.seoul.go.kr/" + finalImgUrl;
                }

                timelineData.push({
                    id: targetId,
                    date: feature.properties.DATE || feature.properties.ADDR_OLD || "날짜 없음",
                    title: feature.properties.TITLE || feature.properties.CONTENTS_NAME,
                    desc: feature.properties.DESC || feature.properties.VALUE_03 || "설명 정보가 없습니다.",
                    imgUrl: finalImgUrl
                });

                let coords = null;
                if (feature.geometry.type === 'Point') {
                    coords = feature.geometry.coordinates;
                } else if (feature.geometry.type === 'GeometryCollection') {
                    const pointGeo = feature.geometry.geometries.find(g => g.type === 'Point');
                    if (pointGeo) coords = pointGeo.coordinates;
                }
                if (coords) {
                    locationsS2.push({
                        id: targetId,
                        pos: [coords[1], coords[0]], // [lat, lng]
                        label: feature.properties.CONTENTS_NAME
                    });
                }
            }
        });

        // 마커 생성
        const markers = {};
        locationsS2.forEach(loc => {
            const stepNumber = targetIds.indexOf(loc.id) + 1;
            const icon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div class='sc2-marker-wrapper sc2-marker-dimmed' id='map-marker-container-${loc.id}'>
                        <div class='sc2-marker-circle'>${stepNumber}</div>
                       </div>`,
                iconSize: [30, 30], iconAnchor: [15, 15]
            });

            const marker = L.marker(loc.pos, { icon }).addTo(mapS2);
            marker.bindTooltip(`<div style="text-align: center; font-weight: bold;">${loc.label}</div>`, {
                permanent: true, direction: 'top', className: 'sc2-marker-tooltip', offset: [0, -15]
            });
            markers[loc.id] = { marker, tooltip: marker.getTooltip() };
        });

        // 초기 경로선
        const initialCoords = targetIds.map(id => locationsS2.find(l => l.id === id)?.pos).filter(Boolean);
        pathLine.setLatLngs(generateCurvedPath(initialCoords));

        // 💡 3. 스크롤 트리거 생성 (투명한 공간)
        const scrollTrack = document.getElementById('sc2-scroll-track');
        scrollTrack.innerHTML = '';

        timelineData.forEach((item, index) => {
            const stepDiv = document.createElement('div');
            stepDiv.className = 'sc2-scroll-step';
            stepDiv.setAttribute('data-marker', item.id);
            stepDiv.setAttribute('data-index', index);
            scrollTrack.appendChild(stepDiv);
        });

        // 💡 4. 고정된 카드 내용 업데이트 함수
        const fixedCard = document.getElementById('sc2-fixed-card');
        const dotsContainer = document.getElementById('sc2-card-dots');

        // 4-1. 데이터 개수만큼 빈 닷(Dot) 요소 생성하기
        dotsContainer.innerHTML = '';
        timelineData.forEach((_, idx) => {
            const dot = document.createElement('div');
            dot.className = 'sc2-dot';
            dot.id = `sc2-dot-${idx}`;

            // 💡 점을 클릭했을 때의 동작 추가
            dot.addEventListener('click', () => {
                // 해당하는 순서의 투명 스크롤 박스(step)를 찾습니다.
                const targetStep = document.querySelector(`.sc2-scroll-step[data-index="${idx}"]`);
                if (targetStep) {
                    // 화면 중앙으로 부드럽게 스크롤 이동!
                    targetStep.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });

            dotsContainer.appendChild(dot);
        });

        let currentCardIndex = -1;

        function updateCardContent(index) {
            if (currentCardIndex === index) return;
            currentCardIndex = index;
            const data = timelineData[index];

            // 내용 즉시 교체
            document.getElementById('sc2-card-date').innerText = data.date;
            document.getElementById('sc2-card-title').innerText = data.title;
            document.getElementById('sc2-card-desc').innerText = data.desc;

            const imgEl = document.getElementById('sc2-card-img');
            if (data.imgUrl) {
                imgEl.src = data.imgUrl;
                imgEl.style.display = 'block';
            } else {
                imgEl.style.display = 'none';
            }

            // 4-2. 현재 인덱스에 맞는 닷(Dot)만 활성화하기
            document.querySelectorAll('.sc2-dot').forEach((dot, idx) => {
                if (idx === index) {
                    dot.classList.add('active');
                } else {
                    dot.classList.remove('active');
                }
            });
        }

        // 💡 5. 스크롤 감지 및 맵/마커 업데이트
        const markerObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const activeId = String(entry.target.getAttribute('data-marker'));
                    const activeIndex = parseInt(entry.target.getAttribute('data-index'), 10);

                    // 1) 고정 카드 내용 변경
                    updateCardContent(activeIndex);

                    // 2) 마커 & 툴팁 하이라이트 변경
                    Object.keys(markers).forEach(key => {
                        const tooltipEl = markers[key]?.tooltip?.getElement();
                        if (tooltipEl) {
                            if (key === activeId) {
                                tooltipEl.classList.remove('sc2-tooltip-dimmed');
                                tooltipEl.classList.add('sc2-tooltip-active');
                            } else {
                                tooltipEl.classList.remove('sc2-tooltip-active');
                                tooltipEl.classList.add('sc2-tooltip-dimmed');
                            }
                        }
                    });

                    targetIds.forEach((id) => {
                        const container = document.getElementById(`map-marker-container-${id}`);
                        if (container) {
                            if (id === activeId) {
                                container.classList.remove('sc2-marker-dimmed');
                                container.classList.add('sc2-marker-active');
                            } else {
                                container.classList.remove('sc2-marker-active');
                                container.classList.add('sc2-marker-dimmed');
                            }
                        }
                    });

                    // 3) 이동한 곳까지만 선 그리기
                    const visibleCoords = targetIds.slice(0, activeIndex + 1).map(id => locationsS2.find(l => String(l.id) === id)?.pos).filter(Boolean);
                    pathLine.setLatLngs(generateCurvedPath(visibleCoords));

                    // // 4) 지도 뷰 이동
                    // const activeLoc = locationsS2.find(l => String(l.id) === activeId);
                    // if (activeLoc) {
                    //     mapS2.invalidateSize();
                    //     const zoom = mapS2.getZoom();
                    //     const targetPoint = mapS2.project(activeLoc.pos, zoom);
                    //     const isMobile = window.innerWidth <= 768;
                    //     const offsetX = isMobile ? 0 : 300;
                    //     targetPoint.x -= offsetX;
                    //     mapS2.panTo(mapS2.unproject(targetPoint, zoom), { animate: true, duration: 1.2 });
                    // }
                }
            });
        }, { threshold: 0.5 });

        document.querySelectorAll('.sc2-scroll-step').forEach(step => markerObserver.observe(step));

        if (timelineData.length > 0) updateCardContent(0);

    } catch (error) {
        console.error(error);
    }
}

/* =======================================================
   섹션 3: 함성의 궤적 (서울시청 고정 + 전체 경로 상시 노출 & 개미 애니메이션)
======================================================= */
async function initSection3() {
    const mapContainer = document.getElementById('map-s3');
    if (!mapContainer) return;

    // 1. 서울시청 중심(37.5665, 126.9780)으로 레벨 9 고정, 조작 차단
    const mapS3 = L.map('map-s3', {
        crs: getCrsEx(),
        zoomControl: false,
        scrollWheelZoom: false,
        dragging: false,        // 드래그 차단
        doubleClickZoom: false, // 더블클릭 줌 차단
        touchZoom: false,       // 터치 줌 차단
        boxZoom: false,         // 박스 줌 차단
        keyboard: false         // 키보드 차단
    }).setView([37.5665, 126.9780 - 0.015], 9);

    const BASE_MAP = `https://map.seoul.go.kr/openapi/v5/${CONFIG.MAP_API_KEY}/public/map/base/dawul_kor_normal/{z}/{j}/{k}/{x}/{y}/png`;
    new L.TileLayer.DAWULGIS_EX(BASE_MAP, { minZoom: 9, maxZoom: 15 }).addTo(mapS3);

    const mapVisibilityObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) setTimeout(() => mapS3.invalidateSize(), 100);
    });
    const section3El = document.getElementById('section-3');
    if (section3El) mapVisibilityObserver.observe(section3El);

    let routeLayers = {}; // 7개의 경로 선을 저장할 객체
    let activeMarkers = [];

    const sc3Groups = [
        { id: 'east-1', targetIds: ["52"] }, { id: 'east-2', targetIds: ["50"] },
        { id: 'west-1', targetIds: ["51"] }, { id: 'west-2', targetIds: ["53"] },
        { id: 'west-3', targetIds: ["49"] }, { id: 'march5-1', targetIds: ["48"] },
        { id: 'march5-2', targetIds: ["47"] }
    ];

    try {
        const response = await fetch('./assets/data/data1_3·1운동시간여행.geojson');
        const sc3Data = await response.json();

        const timelineData3 = [];

        // 2. 데이터 파싱 및 7개 경로 지도에 미리 다 그려두기
        sc3Groups.forEach(group => {
            const feature = sc3Data.features.find(f => String(f.id) === group.targetIds[0]);
            if (feature) {
                const props = feature.properties;
                timelineData3.push({
                    id: group.targetIds[0],
                    title: props.CONTENTS_NAME || "제목 없음",
                    name1: props.NAME_01 || "",
                    val1: props.VALUE_01 || "",
                    name2: props.NAME_02 || "",
                    val2: props.VALUE_02 ? props.VALUE_02.replace(/\n/g, '<br>') : "",
                    feature: feature
                });

                let lineGeo = null;
                if (feature.geometry.type === 'GeometryCollection') {
                    lineGeo = feature.geometry.geometries.find(g => g.type === 'LineString' || g.type === 'MultiLineString');
                } else if (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') {
                    lineGeo = feature.geometry;
                }

                if (lineGeo) {
                    const lineFeature = {
                        type: "Feature",
                        properties: feature.properties,
                        geometry: lineGeo
                    };

                    const layer = L.geoJSON(lineFeature, {
                        style: {
                            color: '#000000',
                            weight: 10,        // 💡 굵기를 3 -> 4로 약간 올려서 눈에 띄게 함
                            opacity: 0.4,     // 💡 투명도를 0.15 -> 0.4로 올려서 확실히 보이게 함
                            lineJoin: 'round',
                            fill: false
                        }
                    }).addTo(mapS3);

                    routeLayers[group.targetIds[0]] = layer;
                }
            }
        });

        // 3. 투명 스크롤 스텝 및 Dot(점) 생성
        const scrollTrack = document.getElementById('sc3-scroll-track');
        const dotsContainer = document.getElementById('sc3-card-dots');
        scrollTrack.innerHTML = '';
        dotsContainer.innerHTML = '';

        timelineData3.forEach((data, index) => {
            const stepDiv = document.createElement('div');
            stepDiv.className = 'sc3-scroll-step';
            stepDiv.setAttribute('data-index', index);
            scrollTrack.appendChild(stepDiv);

            const dot = document.createElement('div');
            dot.className = 'sc3-dot';
            dot.addEventListener('click', () => {
                const targetStep = document.querySelector(`.sc3-scroll-step[data-index="${index}"]`);
                if (targetStep) targetStep.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
            dotsContainer.appendChild(dot);
        });

        // 4. 내용 교체 및 강조(Highlight) 함수
        let currentSection3Index = -1;

        function updateSection3(index) {
            if (currentSection3Index === index) return;
            currentSection3Index = index;
            const data = timelineData3[index];

            // --- A. 텍스트 및 Dot 업데이트 ---
            document.getElementById('sc3-card-title').innerText = data.title;

            const routeBox = document.getElementById('sc3-card-route-box');
            if (data.name1 || data.val1) {
                routeBox.style.display = 'block';
                document.getElementById('sc3-card-route-label').innerText = data.name1;
                document.getElementById('sc3-card-route-val').innerHTML = data.val1;
            } else { routeBox.style.display = 'none'; }

            const descBox = document.getElementById('sc3-card-desc-box');
            if (data.name2 || data.val2) {
                descBox.style.display = 'block';
                document.getElementById('sc3-card-desc-label').innerText = data.name2;
                document.getElementById('sc3-card-desc-val').innerHTML = data.val2;
            } else { descBox.style.display = 'none'; }

            document.querySelectorAll('#sc3-card-dots .sc3-dot').forEach((dot, idx) => {
                if (idx === index) dot.classList.add('active');
                else dot.classList.remove('active');
            });

            // --- B. 선 스타일 변경 및 개미 기어가기 애니메이션 클래스 주입 ---
            timelineData3.forEach((item, idx) => {
                const geoJsonGroup = routeLayers[item.id];
                if (geoJsonGroup) {
                    geoJsonGroup.eachLayer((layer) => {
                        if (idx === index) {
                            // 활성화된 선 (굵고 진한 점선)
                            layer.setStyle({ color: '#ff0000', weight: 8, opacity: 1.0, dashArray: '15, 15' });
                            if (typeof layer.bringToFront === 'function') layer.bringToFront();
                        } else {
                            // 비활성화된 선 (💡 적당히 얇고 반투명하게 설정하여 배경으로 남김)
                            layer.setStyle({ color: '#000000', weight: 3, opacity: 0.8, dashArray: null });
                        }

                        // SVG path에 직접 접근해서 CSS 애니메이션 클래스 달아주기
                        const domEl = layer.getElement ? layer.getElement() : layer._path;
                        if (domEl) {
                            if (idx === index) {
                                domEl.classList.remove('sc3-path-inactive');
                                domEl.classList.add('sc3-path-active');
                            } else {
                                domEl.classList.remove('sc3-path-active');
                                domEl.classList.add('sc3-path-inactive');
                            }
                        }
                    });
                }
            });

            // --- C. 마커 업데이트 (출발, 도착) ---
            activeMarkers.forEach(m => mapS3.removeLayer(m));
            activeMarkers = [];

            let lineCoords = [];
            if (data.feature.geometry.type === 'GeometryCollection') {
                const lineStringGeo = data.feature.geometry.geometries.find(g => g.type === 'LineString');
                if (lineStringGeo) lineCoords = lineStringGeo.coordinates;
            } else if (data.feature.geometry.type === 'LineString') {
                lineCoords = data.feature.geometry.coordinates;
            }

            if (lineCoords.length > 0) {
                const startCoord = [lineCoords[0][1], lineCoords[0][0]];
                const endCoord = [lineCoords[lineCoords.length - 1][1], lineCoords[lineCoords.length - 1][0]];

                const startIcon = L.divIcon({ className: 'sc3-point-marker start', html: '<div class="sc3-point-label">출발</div><div class="sc3-point-dot"></div>', iconSize: [40, 40], iconAnchor: [20, 40] });
                const endIcon = L.divIcon({ className: 'sc3-point-marker end', html: '<div class="sc3-point-label">도착</div><div class="sc3-point-dot"></div>', iconSize: [40, 40], iconAnchor: [20, 40] });

                activeMarkers.push(L.marker(startCoord, { icon: startIcon }).addTo(mapS3));
                activeMarkers.push(L.marker(endCoord, { icon: endIcon }).addTo(mapS3));
            }
        }

        const scrollObserver3 = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const activeIndex = parseInt(entry.target.getAttribute('data-index'), 10);
                    updateSection3(activeIndex);
                }
            });
        }, { threshold: 0.5 });

        document.querySelectorAll('.sc3-scroll-step').forEach(step => scrollObserver3.observe(step));
        if (timelineData3.length > 0) updateSection3(0);

    } catch (error) { console.error(error); }
}

/* =======================================================
   🚀 최종 메인 앱 실행 (App Initialization)
======================================================= */
async function initApp() {
    try {
        console.log("지도 API 부팅 시작...");

        // 1. 서울맵 API가 모두 다운로드될 때까지 기다립니다.
        await loadSeoulMapAPI();
        console.log("✅ 스마트서울맵 API 로드 완료! 화면을 그립니다.");

        // 2. 부팅이 끝나면 UI와 모든 섹션의 지도를 차례대로 깨웁니다.
        initGlobalUI();
        initSection2();
        initSection3();


        console.log("🎉 모든 히스토리맵 섹션 로딩 완료!");

    } catch (error) {
        console.error("❌ 앱 초기화 에러:", error);
    }
}

// 브라우저 렌더링이 준비되면 initApp 함수 실행
document.addEventListener('DOMContentLoaded', initApp);