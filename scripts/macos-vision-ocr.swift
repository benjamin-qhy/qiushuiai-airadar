import Foundation
import Vision

guard CommandLine.arguments.count == 2 else {
  FileHandle.standardError.write(Data("usage: macos-vision-ocr <image>\n".utf8))
  exit(2)
}

let imageURL = URL(fileURLWithPath: CommandLine.arguments[1])
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans", "en-US"]
request.usesLanguageCorrection = true

do {
  try VNImageRequestHandler(url: imageURL).perform([request])
  let text = (request.results ?? [])
    .compactMap { $0.topCandidates(1).first?.string }
    .joined(separator: "\n")
  print(text)
} catch {
  FileHandle.standardError.write(Data("Vision OCR failed: \(error)\n".utf8))
  exit(1)
}
