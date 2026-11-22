#!/usr/bin/env python3
"""Apply RiderSpot income recognition to the real native Android WebView project.

Operates on a temporary extracted source tree during CI and leaves the source
archive and existing production install untouched.
"""
from pathlib import Path
import re
import sys

root = Path(sys.argv[1]).resolve()
repo = Path(__file__).resolve().parents[2]
target = root / "app/src/main"
java = target / "java/com/riderspot/android"
bridge = target / "assets/native-bridge.js"
activity = java / "MainActivity.java"
manifest = target / "AndroidManifest.xml"
gradle = root / "app/build.gradle"
source = repo / "income-diagnostic/app/src/main/java/com/riderspot/incomediag"
custom = Path(__file__).resolve().parent
assert activity.is_file() and manifest.is_file() and bridge.is_file() and gradle.is_file(), "Native source archive is incomplete"

for name in ("AmountAnalyzer", "FeeComponentParser", "NodeContextProbe",
             "IncomePrototypeClassifier", "IncomePrototypeStore", "PrototypeCaptureGate"):
    text = (source / (name + ".java")).read_text(encoding="utf-8")
    assert text.startswith("package com.riderspot.incomediag;"), name
    text = text.replace("package com.riderspot.incomediag;",
                        "package com.riderspot.android;", 1)
    (java / (name + ".java")).write_text(text, encoding="utf-8")
for name in ("RiderIncomeAccessibilityService", "RiderIncomeOwner"):
    (java / (name + ".java")).write_text((custom / (name + ".java")).read_text(),encoding="utf-8")

xml_dir=target/"res/xml"
xml_dir.mkdir(exist_ok=True,parents=True)
(xml_dir/"rider_income_accessibility.xml").write_text(
    """<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowStateChanged|typeWindowContentChanged|typeViewTextChanged"
    android:packageNames="com.coupang.mobile.eats.courier,com.woowahan.bros"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:notificationTimeout="250"
    android:canRetrieveWindowContent="true"
    android:accessibilityFlags="flagReportViewIds"
    android:description="@string/rs_income_accessibility_explanation"/>
""",encoding="utf-8")
strings=target/"res/values/strings.xml"
strings.parent.mkdir(parents=True,exist_ok=True)
s=(strings.read_text(encoding="utf-8") if strings.exists() else
   '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n')
assert s.count("</resources>")==1 and "rs_income_accessibility_explanation" not in s
s=s.replace("</resources>",
"""    <string name="rs_income_accessibility_explanation">사용자가 활성화한 경우에만 배달 완료 금액을 읽고 자동 수익을 계산합니다. 고객 이름과 주소, 전체 화면 원문은 저장하지 않습니다.</string>
</resources>""")
strings.write_text(s,encoding="utf-8")

m=manifest.read_text(encoding="utf-8")
assert m.count("</application>")==1 and "RiderIncomeAccessibilityService" not in m
m=m.replace("</application>",
"""  <service android:name=".RiderIncomeAccessibilityService"
      android:exported="true"
      android:label="라이더스팟 수익 자동수집"
      android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE">
    <intent-filter>
      <action android:name="android.accessibilityservice.AccessibilityService"/>
    </intent-filter>
    <meta-data android:name="android.accessibilityservice"
        android:resource="@xml/rider_income_accessibility"/>
  </service>
</application>""")
manifest.write_text(m,encoding="utf-8")

app=activity.read_text(encoding="utf-8")
assert 'case "oauth-open":' in app and app.count('case "oauth-open":')==1
income_case = '''            case "income-status": {
                String uid=req.optString("userId","");
                org.json.JSONObject income=new org.json.JSONObject();
                income.put("owner",RiderIncomeOwner.owner(this));
                income.put("ownerMatches",RiderIncomeOwner.ownedBy(this,uid));
                income.put("enabled",IncomePrototypeStore.enabled(this));
                boolean connected=false;
                android.view.accessibility.AccessibilityManager manager=
                    (android.view.accessibility.AccessibilityManager)
                        getSystemService(ACCESSIBILITY_SERVICE);
                if(manager!=null){
                    for(android.accessibilityservice.AccessibilityServiceInfo service:
                        manager.getEnabledAccessibilityServiceList(
                            android.accessibilityservice.AccessibilityServiceInfo.FEEDBACK_ALL_MASK)){
                        String serviceId=service.getId();
                        if(serviceId!=null&&serviceId.startsWith(getPackageName()+"/")
                           &&serviceId.contains("RiderIncomeAccessibilityService")){
                            connected=true;break;
                        }
                    }
                }
                income.put("accessibility",connected);
                return income;
            }
            case "income-enable": {
                String uid=req.optString("userId","");
                boolean enabled=req.optBoolean("enabled",false);
                if(!RiderIncomeOwner.bind(this,uid)){
                    result.put("enabled",false);
                    result.put("message","이 기기의 자동수집 원장은 다른 계정에 연결돼 있어요.");
                    return result;
                }
                IncomePrototypeStore.setEnabled(this,enabled);
                result.put("enabled",IncomePrototypeStore.enabled(this));
                return result;
            }
            case "income-records": {
                if(!RiderIncomeOwner.ownedBy(this,req.optString("userId","")))
                    throw new IllegalArgumentException("수익 원장의 계정이 일치하지 않아요.");
                result.put("records",IncomePrototypeStore.records(this));
                return result;
            }
            case "income-ack": {
                if(!RiderIncomeOwner.ownedBy(this,req.optString("userId","")))
                    throw new IllegalArgumentException("수익 원장의 계정이 일치하지 않아요.");
                result.put("saved",RiderIncomeOwner.ack(this,
                    req.optString("captureId",""),req.optString("status","")));
                return result;
            }
            case "income-settings": {
                startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS));
                result.put("opened",true);
                return result;
            }
'''
app=app.replace('            case "oauth-open":',income_case+'            case "oauth-open":',1)
activity.write_text(app,encoding="utf-8")

js=bridge.read_text(encoding="utf-8")
assert "window.__rsNativeInstalled" in js and "window.RiderSpotHost" in js
assert js.rstrip().endswith("})();"), "Native bridge closure structure changed"
assert "window.__rsIncomeNative" not in js
addon=(custom/"native-income-bridge-addon.js").read_text(encoding="utf-8")
js=js.rstrip()[:-5] + "\n" + addon + "\n})();\n"
bridge.write_text(js,encoding="utf-8")

g=gradle.read_text(encoding="utf-8")
g,n=re.subn(r"\bversionCode\s+\d+","versionCode 261",g,count=1)
assert n==1
g,n=re.subn(r"\bversionName\s+['\"][^'\"]+['\"]",
           "versionName '1.0.14-income-native'",g,count=1)
assert n==1
gradle.write_text(g,encoding="utf-8")

# Standalone unit tests of classification logic without hitting a production API.
tests = root / "app/src/test/java/com/riderspot/android"
tests.mkdir(parents=True,exist_ok=True)
for name in ("IncomePrototypeClassifierTest","PrototypeCaptureGateTest"):
    test=(repo/"income-diagnostic/app/src/test/java/com/riderspot/incomediag"/(name+".java")).read_text()
    assert test.startswith("package com.riderspot.incomediag;")
    (tests/(name+".java")).write_text(test.replace("package com.riderspot.incomediag;",
                                                "package com.riderspot.android;",1),encoding="utf-8")
with gradle.open("a",encoding="utf-8") as out:
    out.write("\ndependencies { testImplementation 'junit:junit:4.13.2' }\n")

assert "webView.loadUrl(HOME)" in app
assert "getOnBackInvokedDispatcher" in app
assert "location.reload(" not in js
assert "window.__rsNativeGpsDiagnostics" in js
assert "window.__rsNativeSaveImage" in js
assert "smallestScreenSize|screenLayout" in m
print("Income native patch: PASS; old GPS, OAuth, Back, WebView and recap export preserved")
