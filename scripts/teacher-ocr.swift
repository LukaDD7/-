import Foundation
import Vision
import ImageIO

// Called with a temporary local image; output contains only OCR results.
guard CommandLine.arguments.count == 2 else {
    FileHandle.standardError.write(Data("Missing image\n".utf8))
    exit(2)
}

do {
    let url = URL(fileURLWithPath: CommandLine.arguments[1])
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["zh-Hans", "en-US"]
    request.usesLanguageCorrection = true
    request.minimumTextHeight = 0.006
    let handler = VNImageRequestHandler(url: url, options: [:])
    try handler.perform([request])
    let observations = (request.results ?? []).sorted { first, second in
        let firstY = first.boundingBox.midY
        let secondY = second.boundingBox.midY
        if abs(firstY - secondY) > 0.018 { return firstY > secondY }
        return first.boundingBox.minX < second.boundingBox.minX
    }
    let lines = observations.compactMap { $0.topCandidates(1).first?.string }
    let output = try JSONSerialization.data(withJSONObject: ["text": lines.joined(separator: "\n")], options: [])
    FileHandle.standardOutput.write(output)
} catch {
    FileHandle.standardError.write(Data("Image recognition failed\n".utf8))
    exit(1)
}
