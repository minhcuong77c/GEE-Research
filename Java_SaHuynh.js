// ==========================================
// 1. CẤU HÌNH BAN ĐẦU & TẬP TRUNG VÀO ROI
// ==========================================
Map.centerObject(table, 11);

var startDate = '1993-11-01';
var endDate = '1994-01-31';

// Gọi bộ sưu tập ảnh gốc Landsat 5 
var rawCollection = ee.ImageCollection("LANDSAT/LT05/C02/T1_L2")
  .filterBounds(table)
  .filterDate(startDate, endDate)
  .sort('CLOUD_COVER'); // Xếp ảnh ít mây nhất lên đầu danh sách

// In số lượng ảnh tìm được trong giai đoạn này ra Console để kiểm tra
print("Tổng số ảnh vệ tinh tìm thấy trong giai đoạn mùa đông 1993:", rawCollection.size());

// SỬA LỖI 1: KHÔNG .clip(table) ở đây để tránh lỗi cấu trúc hình học khi Export
var bestRawImage = rawCollection.first(); 

// ==========================================
// 2. HIỆU CHỈNH VẬT LÝ VỀ DẠNG FLOAT
// ==========================================
var applyScaleFactors = function(image) {
  var opticalBands = image.select('SR_B.*').multiply(0.0000275).add(-0.2);
  var thermalBands = image.select('ST_B6').multiply(0.00341802).add(149.0);
  // Trích xuất các band chất lượng và phân loại nếu cần giữ lại
  var qa = image.select(['QA_PIXEL', 'QA_RADSAT']); 
  
  // Trả về ảnh mới tích hợp sạch sẽ các band đã hiệu chỉnh
  return opticalBands.addBands(thermalBands).addBands(qa);
};

// Đưa ảnh về giá trị Reflectance dạng số thực Float (0.0 - 1.0)
var correctedImage = applyScaleFactors(bestRawImage).toFloat();

var blue = correctedImage.select('SR_B1');
var green = correctedImage.select('SR_B2');
var red = correctedImage.select('SR_B3');
var nir = correctedImage.select('SR_B4');
var swir1 = correctedImage.select('SR_B5');

// ==========================================
// 3. TÍNH TOÁN CÁC CHỈ SỐ MÔI TRƯỜNG (DRIVER)
// ==========================================
var ndvi = correctedImage.normalizedDifference(['SR_B4', 'SR_B3']).rename('NDVI');
var ndwi = correctedImage.normalizedDifference(['SR_B2', 'SR_B4']).rename('NDWI');
var mndwi = correctedImage.normalizedDifference(['SR_B2', 'SR_B5']).rename('MNDWI');

// Thêm hằng số an toàn để tránh hiện tượng chia cho 0 tại các pixel nhiễu
var algaeIndex = green.divide(red.add(0.001)).rename('Algae_Index');

// Tích hợp tất cả các chỉ số vào ảnh tổng hợp toàn vẹn không gian
var finalImage = correctedImage.addBands([ndvi, ndwi, mndwi, algaeIndex]);

// Bức ảnh riêng dùng để hiển thị mượt mà trên giao diện Map
var displayImage = finalImage.clip(table);

// ==========================================
// 4. THỨ TỰ HIỂN THỊ TRÊN MAP GEE
// ==========================================

// LỚP 1: Ảnh tổ hợp màu tự nhiên gốc (B3, B2, B1) - Giá trị sau scale từ 0.0 - 0.3
var trueColorParams = {
  bands: ['SR_B3', 'SR_B2', 'SR_B1'],
  min: 0.02,
  max: 0.22
};
Map.addLayer(displayImage, trueColorParams, '1. ANH GỐC TỔ HỢP MÀU TỰ NHIÊN');

// LỚP 2: Chỉ số Tách mặt nước (MNDWI)
Map.addLayer(displayImage.select('MNDWI'), {min: -0.2, max: 0.6, palette: ['brown', 'white', 'blue']}, '2. Chỉ số Nước chuẩn hóa (MNDWI)');

// LỚP 3: Chỉ số Thực vật (NDVI)
Map.addLayer(displayImage.select('NDVI'), {min: -0.1, max: 0.6, palette: ['blue', 'white', 'green']}, '3. Chỉ số Thực vật (NDVI)');

// LỚP 4: Chỉ số Tảo và Sinh vật phù du tầng mặt
Map.addLayer(displayImage.select('Algae_Index'), {min: 0.5, max: 2.0, palette: ['blue', 'yellow', 'green']}, '4. Chỉ số Tảo & Phù du mặt nước');

// LỚP 5: Ranh giới vùng nghiên cứu của bạn để đối chiếu
Map.addLayer(table, {color: 'red'}, 'Ranh giới vùng ROI (table)', false);

// ==========================================
// 5. XUẤT DỮ LIỆU VỀ GOOGLE DRIVE (HỆ 4326)
// ==========================================
// Hàm xuất sử dụng "finalImage" (Ảnh chưa bị chặt góc hình học) để tránh lỗi xử lý server
Export.image.toDrive({
  image: finalImage,
  description: 'Landsat5_1993_Winter_Fixed_EPSG4326',
  folder: 'GEE_Output',
  scale: 30,
  region: table.geometry(), // Tối ưu: Lấy bounding box hình học của table để tránh quá tải đỉnh (vertices)
  crs: 'EPSG:4326', 
  maxPixels: 1e13
});
