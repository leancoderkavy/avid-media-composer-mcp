import {expect,it} from "vitest";
import {inventoryStreamDetails} from "../src/library/inventory-report.js";
it("keeps separate stream declarations and escapes camera metadata",()=>{
 const html=inventoryStreamDetails({format:{tags:{make:'<script>alert(1)</script>',GPS:"private-location"}},streams:[{index:2,codec_type:"video",color_transfer:"smpte2084",tags:{timecode:"01:00:00:00"}},{index:4,codec_type:"audio",channels:6,channel_layout:"5.1"}]});
 expect(html).toContain("Stream 2");expect(html).toContain("Stream 4");expect(html).toContain("smpte2084");expect(html).toContain("01:00:00:00");expect(html).toContain("5.1");expect(html).toContain("&lt;script&gt;");expect(html).not.toContain("<script>");expect(html).not.toContain("private-location");expect(html).toContain("Not recorded");
});
it("reports missing streams and camera tags without guessing",()=>{
 const html=inventoryStreamDetails({});expect(html).toContain("No streams recorded");expect(html).toContain("Not recorded");
});
