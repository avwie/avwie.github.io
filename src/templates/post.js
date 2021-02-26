import * as React from "react"
import {graphql} from "gatsby";
import DefaultLayout from "../layouts/default";

export default ({ data }) => {
    const { title, date } = data.markdown.frontmatter
    const content = data.markdown.html

    return (
        <DefaultLayout>
            <h1 className="text-decoration-underline fs-1 py-2">{ title }</h1>
            <h4>{ date }</h4>
            <div className="fs-5 col-lg-10" dangerouslySetInnerHTML={{__html: content }} />
        </DefaultLayout>
    )
}

export const query = graphql`
query($slug: String!) {
    markdown: markdownRemark(frontmatter: { slug: { eq: $slug } }) {
        html
        frontmatter {
            date(formatString: "DD MMM, YYYY")
            slug
            title
        }
    }
}
`